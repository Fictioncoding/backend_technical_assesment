import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import {
  CASHFREE_API_VERSION,
  CASHFREE_SANDBOX_BASE_URL,
  CASHFREE_PRODUCTION_BASE_URL,
} from '../../../common/constants/payment.constants';

export interface CreateCashfreeOrderInput {
  orderId: string;
  orderAmount: number;
  orderCurrency: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl?: string;
  notifyUrl?: string;
  orderNote?: string;
}

export interface CashfreeOrderResponse {
  cf_order_id: string | number;
  order_id: string;
  entity: string;
  order_currency: string;
  order_amount: number;
  order_status: 'ACTIVE' | 'PAID' | 'EXPIRED';
  payment_session_id: string;
  order_expiry_time?: string;
  order_note?: string;
}

export interface CashfreePaymentItem {
  cf_payment_id: string | number;
  order_id: string;
  payment_status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED' | 'CANCELLED' | 'PENDING';
  payment_amount: number;
  payment_currency: string;
  payment_message?: string;
  payment_time?: string;
  bank_reference?: string;
  auth_id?: string;
  payment_method?: Record<string, any>;
  payment_group?: string;
  error_details?: Record<string, any>;
}

@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);
  private readonly httpClient: AxiosInstance;
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly isMockMode: boolean;

  // In-memory mock store for local/sandbox simulation when mock mode is enabled
  private readonly mockOrders = new Map<string, CashfreeOrderResponse>();
  private readonly mockPayments = new Map<string, CashfreePaymentItem[]>();

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('cashfree.appId', '');
    this.secretKey = this.configService.get<string>('cashfree.secretKey', '');
    this.apiVersion = this.configService.get<string>(
      'cashfree.apiVersion',
      CASHFREE_API_VERSION,
    );
    const env = this.configService.get<string>('cashfree.environment', 'SANDBOX');
    this.baseUrl =
      env === 'PRODUCTION'
        ? CASHFREE_PRODUCTION_BASE_URL
        : CASHFREE_SANDBOX_BASE_URL;

    this.isMockMode = this.configService.get<boolean>('cashfree.mockMode', true);

    if (this.isMockMode) {
      this.logger.warn(
        'CashfreeService running in SIMULATION/MOCK mode. Real gateway API calls are mocked with realistic sandbox payloads.',
      );
    } else {
      this.logger.log(
        `CashfreeService initialized for [${env}] environment at ${this.baseUrl}`,
      );
    }

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'x-client-id': this.appId,
        'x-client-secret': this.secretKey,
        'x-api-version': this.apiVersion,
        'Content-Type': 'application/json',
      },
    });
  }

  public getMockMode(): boolean {
    return this.isMockMode;
  }

  public getSecretKey(): string {
    return this.secretKey || 'test_webhook_secret_key';
  }

  /**
   * Resolves customer checkout URL based on gateway environment (production vs sandbox)
   */
  public getCheckoutUrl(paymentSessionId: string): string {
    const env = this.configService.get<string>('cashfree.environment', 'SANDBOX');
    const host =
      env.toUpperCase() === 'PRODUCTION'
        ? 'https://payments.cashfree.com'
        : 'https://payments-test.cashfree.com';
    return `${host}/order/#${paymentSessionId}`;
  }

  /**
   * Create an order on Cashfree Payment Gateway
   */
  async createOrder(input: CreateCashfreeOrderInput): Promise<CashfreeOrderResponse> {
    if (this.isMockMode) {
      return this.mockCreateOrder(input);
    }

    try {
      const payload = {
        order_id: input.orderId,
        order_amount: input.orderAmount,
        order_currency: input.orderCurrency || 'INR',
        customer_details: {
          customer_id: input.customerId,
          customer_name: input.customerName,
          customer_email: input.customerEmail,
          customer_phone: input.customerPhone,
        },
        order_meta: {
          return_url: input.returnUrl,
          notify_url: input.notifyUrl,
        },
        order_note: input.orderNote,
      };

      this.logger.log(`Initiating Cashfree PG Order: ${input.orderId}`);
      const response = await this.httpClient.post<CashfreeOrderResponse>(
        '/orders',
        payload,
      );
      return response.data;
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message || error.message || 'Error communicating with Cashfree';
      this.logger.error(
        `Cashfree Order Creation Failed for ${input.orderId}: ${errorMsg}`,
        error.response?.data,
      );
      throw new BadRequestException(`Cashfree PG Error: ${errorMsg}`);
    }
  }

  /**
   * Fetch order status directly from Cashfree
   */
  async getOrder(orderId: string): Promise<CashfreeOrderResponse> {
    if (this.isMockMode) {
      const mockOrder = this.mockOrders.get(orderId);
      if (!mockOrder) {
        throw new BadRequestException(`Cashfree Order '${orderId}' not found in simulation`);
      }
      return mockOrder;
    }

    try {
      const response = await this.httpClient.get<CashfreeOrderResponse>(
        `/orders/${orderId}`,
      );
      return response.data;
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message || error.message || 'Error fetching order from Cashfree';
      throw new BadRequestException(`Cashfree PG Error: ${errorMsg}`);
    }
  }

  /**
   * Fetch payment attempts and status for an order
   */
  async getOrderPayments(orderId: string): Promise<CashfreePaymentItem[]> {
    if (this.isMockMode) {
      return this.mockPayments.get(orderId) || [];
    }

    try {
      const response = await this.httpClient.get<CashfreePaymentItem[]>(
        `/orders/${orderId}/payments`,
      );
      return response.data;
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message || error.message || 'Error fetching payments from Cashfree';
      throw new BadRequestException(`Cashfree PG Error: ${errorMsg}`);
    }
  }

  /**
   * Verify Cashfree Webhook Signature using HMAC SHA-256 over timestamp + rawBody
   */
  verifyWebhookSignature(
    signature: string,
    timestamp: string,
    rawBody: string,
  ): boolean {
    if (!signature || !timestamp || !rawBody) {
      this.logger.warn('Webhook verification rejected: Missing signature, timestamp, or raw body payload');
      return false;
    }

    const secretKey = this.getSecretKey();

    try {
      const payload = `${timestamp}${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(payload)
        .digest('base64');

      const isValid = this.timingSafeEqual(signature, expectedSignature);
      if (!isValid) {
        this.logger.warn(`Webhook signature mismatch for timestamp ${timestamp}`);
      }
      return isValid;
    } catch (err: any) {
      this.logger.error(`Error calculating webhook signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Helper to generate a valid webhook signature for test / simulation purposes
   */
  generateTestWebhookSignature(timestamp: string, rawBody: string): string {
    const secretKey = this.getSecretKey();
    return crypto
      .createHmac('sha256', secretKey)
      .update(timestamp + rawBody)
      .digest('base64');
  }

  /**
   * Constant time comparison to prevent timing attacks
   */
  private timingSafeEqual(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) {
        return false;
      }
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  // --- Mock Simulation Engine ---

  private mockCreateOrder(input: CreateCashfreeOrderInput): CashfreeOrderResponse {
    const cfOrderId = Math.floor(100000000 + Math.random() * 900000000);
    const sessionId = `session_sim_${crypto.randomBytes(16).toString('hex')}`;
    const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const orderResponse: CashfreeOrderResponse = {
      cf_order_id: cfOrderId,
      order_id: input.orderId,
      entity: 'order',
      order_currency: input.orderCurrency || 'INR',
      order_amount: input.orderAmount,
      order_status: 'ACTIVE',
      payment_session_id: sessionId,
      order_expiry_time: expiry,
      order_note: input.orderNote,
    };

    this.mockOrders.set(input.orderId, orderResponse);
    this.mockPayments.set(input.orderId, []);
    return orderResponse;
  }
}
