import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CashfreeService } from './cashfree.service';
import * as crypto from 'crypto';

describe('CashfreeService', () => {
  let service: CashfreeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashfreeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'cashfree.mockMode') return true;
              if (key === 'cashfree.secretKey') return 'test_secret_key_12345';
              if (key === 'cashfree.appId') return 'test_app_id';
              if (key === 'cashfree.environment') return 'SANDBOX';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CashfreeService>(CashfreeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrder (mock mode)', () => {
    it('should create an active order with payment session id', async () => {
      const order = await service.createOrder({
        orderId: 'TEST_ORD_001',
        orderAmount: 1500,
        orderCurrency: 'INR',
        customerId: 'STU001',
        customerName: 'Test Student',
        customerEmail: 'test@student.edu',
        customerPhone: '9999999999',
      });

      expect(order).toBeDefined();
      expect(order.order_id).toBe('TEST_ORD_001');
      expect(order.order_amount).toBe(1500);
      expect(order.order_status).toBe('ACTIVE');
      expect(order.payment_session_id).toContain('session_sim_');
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify a valid HMAC-SHA256 signature (timestamp + rawBody)', () => {
      const timestamp = '1727876428';
      const rawBody = JSON.stringify({ event: 'test', data: { id: 1 } });
      const secret = 'test_secret_key_12345';

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(timestamp + rawBody)
        .digest('base64');

      const isValid = service.verifyWebhookSignature(
        validSignature,
        timestamp,
        rawBody,
      );

      expect(isValid).toBe(true);
    });

    it('should reject a tampered or invalid signature', () => {
      const timestamp = '1727876428';
      const rawBody = JSON.stringify({ event: 'test' });
      const invalidSignature = 'tampered_invalid_signature_base64';

      const isValid = service.verifyWebhookSignature(
        invalidSignature,
        timestamp,
        rawBody,
      );

      expect(isValid).toBe(false);
    });

    it('should reject when signature or timestamp is missing', () => {
      expect(service.verifyWebhookSignature('', '1727876428', '{}')).toBe(false);
      expect(service.verifyWebhookSignature('sig', '', '{}')).toBe(false);
      expect(service.verifyWebhookSignature('sig', '1727876428', '')).toBe(false);
    });
  });
});
