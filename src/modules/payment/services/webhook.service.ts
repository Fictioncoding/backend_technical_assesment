import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookEventLog } from '../entities/webhook-event-log.entity';
import { PaymentOrder } from '../entities/payment-order.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { CashfreeService } from './cashfree.service';
import { ErpService } from '../../erp/erp.service';
import { CashfreeWebhookPayload } from '../dto/cashfree-webhook.dto';
import {
  PaymentOrderStatus,
  PaymentTransactionStatus,
  WebhookEventStatus,
} from '../../../common/constants/payment.constants';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEventLog)
    private readonly webhookLogRepo: Repository<WebhookEventLog>,
    @InjectRepository(PaymentOrder)
    private readonly orderRepo: Repository<PaymentOrder>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly cashfreeService: CashfreeService,
    private readonly erpService: ErpService,
  ) {}

  /**
   * Process incoming Cashfree Webhook event with HMAC SHA-256 signature verification and deduplication
   */
  async processWebhook(
    signature: string,
    timestamp: string,
    rawBody: string,
    parsedPayload: CashfreeWebhookPayload,
  ): Promise<{ status: string; eventId: string; message: string }> {
    // Validate signature against unparsed raw body
    const isValidSignature = this.cashfreeService.verifyWebhookSignature(
      signature,
      timestamp,
      rawBody,
    );

    if (!isValidSignature) {
      this.logger.error('Cashfree Webhook rejected: Invalid HMAC SHA-256 signature');
      throw new UnauthorizedException('Invalid Cashfree webhook signature');
    }

    const eventType = parsedPayload?.type;
    const orderData = parsedPayload?.data?.order;
    const paymentData = parsedPayload?.data?.payment;

    if (!orderData?.order_id) {
      throw new BadRequestException('Webhook payload missing required order data.');
    }

    // Deterministic event id for deduplication
    const eventId = paymentData?.cf_payment_id
      ? `${eventType}_${paymentData.cf_payment_id}`
      : `${eventType}_${orderData.order_id}_${parsedPayload.event_time || Date.now()}`;

    // Idempotency check
    const existingLog = await this.webhookLogRepo.findOne({
      where: { eventId },
    });

    if (existingLog && existingLog.status === WebhookEventStatus.PROCESSED) {
      this.logger.warn(`Duplicate webhook received: ${eventId}. Acknowledging idempotently.`);
      return {
        status: 'DUPLICATE_IGNORED',
        eventId,
        message: 'Webhook already processed earlier. Duplicate event safely ignored.',
      };
    }

    // Record initial audit entry
    const webhookLog = existingLog || this.webhookLogRepo.create({
      eventId,
      eventType: eventType || 'UNKNOWN_WEBHOOK',
      orderId: orderData.order_id,
      cfPaymentId: paymentData?.cf_payment_id ? String(paymentData.cf_payment_id) : null,
      signature,
      timestampHeader: timestamp,
      payload: parsedPayload,
      status: WebhookEventStatus.RECEIVED,
    });
    await this.webhookLogRepo.save(webhookLog);

    try {
      // Process event payload
      await this.handleWebhookEvent(eventType, orderData, paymentData, parsedPayload);

      // Update audit status to processed
      webhookLog.status = WebhookEventStatus.PROCESSED;
      webhookLog.processedAt = new Date();
      await this.webhookLogRepo.save(webhookLog);

      return {
        status: 'SUCCESS',
        eventId,
        message: `Webhook event '${eventType}' processed successfully.`,
      };
    } catch (err: any) {
      this.logger.error(`Failed to process webhook ${eventId}: ${err.message}`, err.stack);
      webhookLog.status = WebhookEventStatus.FAILED;
      webhookLog.errorMessage = err.message;
      await this.webhookLogRepo.save(webhookLog);
      throw err;
    }
  }

  /**
   * Internal router for webhook event types
   */
  private async handleWebhookEvent(
    eventType: string,
    orderData: any,
    paymentData: any,
    payload: CashfreeWebhookPayload,
  ): Promise<void> {
    const orderId = orderData.order_id;
    const order = await this.orderRepo.findOne({
      where: { orderId },
    });

    if (!order) {
      this.logger.warn(`Order '${orderId}' received in webhook not found in local database.`);
      return;
    }

    // Record or update transaction attempt
    if (paymentData?.cf_payment_id) {
      await this.recordPaymentTransaction(order, paymentData);
    }

    switch (eventType) {
      case 'PAYMENT_SUCCESS_WEBHOOK':
        order.status = PaymentOrderStatus.SUCCESS;
        await this.orderRepo.save(order);

        // Sync ERP Bill to PAID
        await this.erpService.syncPaymentStatus(
          order.erpBillId,
          order.orderId,
          'WEBHOOK_PAYMENT_SUCCESS',
          'SUCCESS',
          paymentData?.payment_amount || order.amount,
          {
            cfPaymentId: paymentData?.cf_payment_id,
            bankReference: paymentData?.bank_reference,
            paymentMethod: paymentData?.payment_method,
          },
        );
        this.logger.log(`Order ${orderId} marked SUCCESS via webhook. ERP bill updated.`);
        break;

      case 'PAYMENT_FAILED_WEBHOOK':
        // If order hasn't succeeded via another transaction, update status
        if (order.status !== PaymentOrderStatus.SUCCESS) {
          order.status = PaymentOrderStatus.FAILED;
          await this.orderRepo.save(order);

          await this.erpService.syncPaymentStatus(
            order.erpBillId,
            order.orderId,
            'WEBHOOK_PAYMENT_FAILED',
            'FAILED',
            0,
            {
              cfPaymentId: paymentData?.cf_payment_id,
              failureReason: paymentData?.payment_message,
            },
          );
        }
        this.logger.log(`Order ${orderId} marked FAILED via webhook.`);
        break;

      case 'PAYMENT_USER_DROPPED_WEBHOOK':
        this.logger.log(`Payment attempt dropped by student for Order ${orderId}.`);
        if (order.status !== PaymentOrderStatus.SUCCESS) {
          await this.erpService.syncPaymentStatus(
            order.erpBillId,
            order.orderId,
            'WEBHOOK_USER_DROPPED',
            'PENDING',
          );
        }
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
        break;
    }
  }

  /**
   * Record or update transaction attempt in database
   */
  private async recordPaymentTransaction(
    order: PaymentOrder,
    paymentData: any,
  ): Promise<PaymentTransaction> {
    const cfPaymentId = String(paymentData.cf_payment_id);
    let tx = await this.transactionRepo.findOne({
      where: { cfPaymentId },
    });

    const statusMapping: Record<string, PaymentTransactionStatus> = {
      SUCCESS: PaymentTransactionStatus.SUCCESS,
      FAILED: PaymentTransactionStatus.FAILED,
      USER_DROPPED: PaymentTransactionStatus.USER_DROPPED,
      CANCELLED: PaymentTransactionStatus.CANCELLED,
      PENDING: PaymentTransactionStatus.PENDING,
    };

    const txStatus =
      statusMapping[paymentData.payment_status] || PaymentTransactionStatus.PENDING;

    if (!tx) {
      tx = this.transactionRepo.create({
        paymentOrderId: order.id,
        cfPaymentId,
        status: txStatus,
        amount: paymentData.payment_amount || order.amount,
        currency: paymentData.payment_currency || 'INR',
        paymentMethod: paymentData.payment_method
          ? Object.keys(paymentData.payment_method)[0]
          : 'UNKNOWN',
        paymentGroup: paymentData.payment_group,
        bankReference: paymentData.bank_reference,
        authId: paymentData.auth_id,
        paymentMessage: paymentData.payment_message,
        paymentTime: paymentData.payment_time
          ? new Date(paymentData.payment_time)
          : new Date(),
        rawGatewayResponse: paymentData,
      });
    } else {
      tx.status = txStatus;
      tx.bankReference = paymentData.bank_reference || tx.bankReference;
      tx.paymentMessage = paymentData.payment_message || tx.paymentMessage;
      tx.rawGatewayResponse = paymentData;
    }

    return this.transactionRepo.save(tx);
  }

  /**
   * Helper to simulate a test webhook for local testing and developer verification
   */
  async simulateWebhookEvent(
    orderId: string,
    status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED',
  ) {
    const order = await this.orderRepo.findOne({ where: { orderId } });
    if (!order) {
      throw new BadRequestException(`Order '${orderId}' not found.`);
    }

    const cfPaymentId = Math.floor(100000000 + Math.random() * 900000000);
    const timestamp = Date.now().toString();

    const eventType =
      status === 'SUCCESS'
        ? 'PAYMENT_SUCCESS_WEBHOOK'
        : status === 'FAILED'
        ? 'PAYMENT_FAILED_WEBHOOK'
        : 'PAYMENT_USER_DROPPED_WEBHOOK';

    const payload: CashfreeWebhookPayload = {
      data: {
        order: {
          order_id: order.orderId,
          order_amount: Number(order.amount),
          order_currency: order.currency,
        },
        payment: {
          cf_payment_id: cfPaymentId,
          payment_status: status,
          payment_amount: Number(order.amount),
          payment_currency: order.currency,
          payment_message:
            status === 'SUCCESS'
              ? 'Transaction Successful'
              : 'Payment declined by issuer bank',
          payment_time: new Date().toISOString(),
          bank_reference: `UTR${Date.now()}`,
          payment_group: 'upi',
          payment_method: {
            upi: { upi_id: `${order.studentId.toLowerCase()}@okhdfcbank` },
          },
        },
        customer_details: {
          customer_id: order.studentId,
          customer_name: order.studentName,
          customer_email: order.studentEmail,
          customer_phone: order.studentPhone,
        },
      },
      event_time: new Date().toISOString(),
      type: eventType,
    };

    const rawBody = JSON.stringify(payload);
    const signature = this.cashfreeService.generateTestWebhookSignature(
      timestamp,
      rawBody,
    );

    return this.processWebhook(signature, timestamp, rawBody, payload);
  }
}
