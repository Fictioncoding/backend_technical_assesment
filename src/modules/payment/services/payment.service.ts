import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PaymentOrder } from '../entities/payment-order.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { IdempotencyKey } from '../entities/idempotency-key.entity';
import { CashfreeService } from './cashfree.service';
import { ErpService } from '../../erp/erp.service';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import {
  PaymentOrderResponseDto,
  PaymentVerificationResponseDto,
  PaymentAnalyticsDto,
} from '../dto/payment-response.dto';
import {
  PaymentOrderStatus,
  PaymentTransactionStatus,
  ErpBillStatus,
} from '../../../common/constants/payment.constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentOrder)
    private readonly orderRepo: Repository<PaymentOrder>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepo: Repository<IdempotencyKey>,
    private readonly cashfreeService: CashfreeService,
    private readonly erpService: ErpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initiate a payment order for a University ERP fee bill
   */
  async initiatePayment(
    dto: InitiatePaymentDto,
    headerIdempotencyKey?: string,
  ): Promise<PaymentOrderResponseDto> {
    const rawKey = headerIdempotencyKey || dto.idempotencyKey;
    const requestPayload = JSON.stringify(dto);
    const requestHash = crypto
      .createHash('sha256')
      .update(requestPayload)
      .digest('hex');

    // Check idempotency key
    if (rawKey) {
      const existingIdempotency = await this.idempotencyRepo.findOne({
        where: { key: rawKey },
      });

      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key reused with different request payload.',
          );
        }
        if (existingIdempotency.responseBody) {
          this.logger.log(`Idempotent hit for key: ${rawKey}. Returning cached response.`);
          return existingIdempotency.responseBody as PaymentOrderResponseDto;
        }
      }
    }

    // Validate bill exists and can be paid
    const bill = await this.erpService.getBill(dto.erpBillId);
    if (bill.status === ErpBillStatus.PAID) {
      throw new BadRequestException(
        `ERP Bill '${dto.erpBillId}' has already been fully paid.`,
      );
    }

    // Generate unique order id
    const orderId = `ORD_UMS_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const returnUrl =
      dto.returnUrl ||
      this.configService
        .get<string>('frontendReturnUrl')
        .replace('{order_id}', orderId);

    // Persist initial order record
    const newOrder = this.orderRepo.create({
      orderId,
      erpBillId: dto.erpBillId,
      studentId: dto.studentId,
      studentName: dto.studentName,
      studentEmail: dto.studentEmail,
      studentPhone: dto.studentPhone,
      amount: dto.amount,
      currency: dto.currency || 'INR',
      status: PaymentOrderStatus.PENDING,
      orderNote: dto.orderNote || `Payment for Bill ${dto.erpBillId}`,
      returnUrl,
    });
    const savedOrder = await this.orderRepo.save(newOrder);

    // Request order creation on Cashfree
    let cfResponse;
    try {
      cfResponse = await this.cashfreeService.createOrder({
        orderId,
        orderAmount: dto.amount,
        orderCurrency: dto.currency || 'INR',
        customerId: dto.studentId,
        customerName: dto.studentName,
        customerEmail: dto.studentEmail,
        customerPhone: dto.studentPhone,
        orderNote: savedOrder.orderNote,
        returnUrl,
      });
    } catch (error: any) {
      savedOrder.status = PaymentOrderStatus.FAILED;
      await this.orderRepo.save(savedOrder);
      throw error;
    }

    // Attach gateway session id
    savedOrder.cfOrderId = String(cfResponse.cf_order_id);
    savedOrder.paymentSessionId = cfResponse.payment_session_id;
    savedOrder.status = PaymentOrderStatus.ACTIVE;
    if (cfResponse.order_expiry_time) {
      savedOrder.expiresAt = new Date(cfResponse.order_expiry_time);
    }
    const finalOrder = await this.orderRepo.save(savedOrder);

    // Update bill status in ERP
    await this.erpService.syncPaymentStatus(
      dto.erpBillId,
      orderId,
      'PAYMENT_INITIATED',
      'PENDING',
      dto.amount,
    );

    const checkoutUrl = this.cashfreeService.getCheckoutUrl(
      finalOrder.paymentSessionId,
    );

    const responseDto: PaymentOrderResponseDto = {
      orderId: finalOrder.orderId,
      cfOrderId: finalOrder.cfOrderId,
      paymentSessionId: finalOrder.paymentSessionId,
      erpBillId: finalOrder.erpBillId,
      studentId: finalOrder.studentId,
      studentName: finalOrder.studentName,
      amount: finalOrder.amount,
      currency: finalOrder.currency,
      status: finalOrder.status,
      checkoutUrl,
      returnUrl: finalOrder.returnUrl,
      createdAt: finalOrder.createdAt,
    };

    // Cache response for idempotent client retries
    if (rawKey) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const idempotencyRecord = this.idempotencyRepo.create({
        key: rawKey,
        targetResource: 'PAYMENT_ORDER',
        requestHash,
        responseCode: 201,
        responseBody: responseDto,
        expiresAt,
      });
      await this.idempotencyRepo.save(idempotencyRecord);
    }

    return responseDto;
  }

  /**
   * Fetch an order by business order ID
   */
  async getOrder(orderId: string): Promise<PaymentOrder> {
    const order = await this.orderRepo.findOne({
      where: { orderId },
      relations: ['transactions'],
    });
    if (!order) {
      throw new NotFoundException(`Payment Order '${orderId}' not found.`);
    }
    return order;
  }

  /**
   * Actively verify payment status with Cashfree Gateway and update ERP
   */
  async verifyPayment(orderId: string): Promise<PaymentVerificationResponseDto> {
    const order = await this.getOrder(orderId);

    // Fetch latest status and payments from Cashfree
    let gatewayOrder;
    let gatewayPayments = [];

    try {
      gatewayOrder = await this.cashfreeService.getOrder(orderId);
      gatewayPayments = await this.cashfreeService.getOrderPayments(orderId);
    } catch (err: any) {
      this.logger.error(`Error querying Cashfree for order ${orderId}: ${err.message}`);
    }

    // Process transactions returned by gateway
    for (const payment of gatewayPayments) {
      const existingTx = await this.transactionRepo.findOne({
        where: { cfPaymentId: String(payment.cf_payment_id) },
      });

      if (!existingTx) {
        const newTx = this.transactionRepo.create({
          paymentOrderId: order.id,
          cfPaymentId: String(payment.cf_payment_id),
          status: payment.payment_status as PaymentTransactionStatus,
          amount: payment.payment_amount,
          currency: payment.payment_currency || 'INR',
          paymentMethod: payment.payment_method ? Object.keys(payment.payment_method)[0] : 'UNKNOWN',
          paymentGroup: payment.payment_group,
          bankReference: payment.bank_reference,
          authId: payment.auth_id,
          paymentMessage: payment.payment_message,
          failureReason: payment.error_details ? JSON.stringify(payment.error_details) : null,
          rawGatewayResponse: payment,
          paymentTime: payment.payment_time ? new Date(payment.payment_time) : new Date(),
        });
        await this.transactionRepo.save(newTx);
      }
    }

    // Check if any payment was successful
    const hasSuccessfulPayment = gatewayPayments.some(
      (p) => p.payment_status === 'SUCCESS',
    );

    let erpSyncStatus = 'ERP sync unaffected';

    if (hasSuccessfulPayment || gatewayOrder?.order_status === 'PAID') {
      order.status = PaymentOrderStatus.SUCCESS;
      await this.orderRepo.save(order);

      await this.erpService.syncPaymentStatus(
        order.erpBillId,
        order.orderId,
        'VERIFIED_SUCCESS',
        'SUCCESS',
        order.amount,
      );
      erpSyncStatus = 'ERP Bill updated to PAID and synced successfully';
    } else if (gatewayOrder?.order_status === 'EXPIRED') {
      order.status = PaymentOrderStatus.EXPIRED;
      await this.orderRepo.save(order);
      await this.erpService.syncPaymentStatus(
        order.erpBillId,
        order.orderId,
        'VERIFIED_EXPIRED',
        'FAILED',
      );
      erpSyncStatus = 'Order marked EXPIRED and ERP bill retained UNPAID';
    }

    // Reload order with updated transactions
    const refreshedOrder = await this.getOrder(orderId);

    const transactionSummaries = (refreshedOrder.transactions || []).map((t) => ({
      cfPaymentId: t.cfPaymentId,
      status: t.status,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      bankReference: t.bankReference,
      paymentMessage: t.paymentMessage,
      paymentTime: t.paymentTime,
    }));

    return {
      orderId: refreshedOrder.orderId,
      erpBillId: refreshedOrder.erpBillId,
      orderStatus: refreshedOrder.status,
      isPaid: refreshedOrder.status === PaymentOrderStatus.SUCCESS,
      amount: refreshedOrder.amount,
      transactions: transactionSummaries,
      erpSyncStatus,
    };
  }

  /**
   * Cancel an active or pending order
   */
  async cancelOrder(orderId: string): Promise<PaymentOrder> {
    const order = await this.getOrder(orderId);

    if (order.status === PaymentOrderStatus.SUCCESS) {
      throw new BadRequestException('Cannot cancel an already completed payment order.');
    }

    order.status = PaymentOrderStatus.CANCELLED;
    const updated = await this.orderRepo.save(order);

    await this.erpService.syncPaymentStatus(
      order.erpBillId,
      order.orderId,
      'ORDER_CANCELLED',
      'CANCELLED',
    );

    return updated;
  }

  /**
   * Aggregate payment metrics and key performance indicators
   */
  async getAnalytics(): Promise<PaymentAnalyticsDto> {
    const rawMetrics = await this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(order.id)', 'totalOrders')
      .addSelect(
        `COUNT(CASE WHEN order.status = '${PaymentOrderStatus.SUCCESS}' THEN 1 END)`,
        'successfulOrders',
      )
      .addSelect(
        `COUNT(CASE WHEN order.status = '${PaymentOrderStatus.FAILED}' THEN 1 END)`,
        'failedOrders',
      )
      .addSelect(
        `COUNT(CASE WHEN order.status IN ('${PaymentOrderStatus.PENDING}', '${PaymentOrderStatus.ACTIVE}') THEN 1 END)`,
        'pendingOrders',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN order.status = '${PaymentOrderStatus.SUCCESS}' THEN order.amount ELSE 0 END), 0)`,
        'totalRevenueCollected',
      )
      .getRawOne();

    const totalOrders = parseInt(rawMetrics?.totalOrders || '0', 10);
    const successfulOrders = parseInt(rawMetrics?.successfulOrders || '0', 10);
    const failedOrders = parseInt(rawMetrics?.failedOrders || '0', 10);
    const pendingOrders = parseInt(rawMetrics?.pendingOrders || '0', 10);
    const totalRevenueCollected = parseFloat(
      rawMetrics?.totalRevenueCollected || '0',
    );

    const successRatePercentage =
      totalOrders > 0
        ? parseFloat(((successfulOrders / totalOrders) * 100).toFixed(2))
        : 0;

    return {
      totalOrders,
      successfulOrders,
      failedOrders,
      pendingOrders,
      totalRevenueCollected,
      successRatePercentage,
    };
  }
}
