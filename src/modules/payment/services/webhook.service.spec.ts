import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookService } from './webhook.service';
import { CashfreeService } from './cashfree.service';
import { ErpService } from '../../erp/erp.service';
import { WebhookEventLog } from '../entities/webhook-event-log.entity';
import { PaymentOrder } from '../entities/payment-order.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import {
  PaymentOrderStatus,
  WebhookEventStatus,
} from '../../../common/constants/payment.constants';
import { UnauthorizedException } from '@nestjs/common';

describe('WebhookService', () => {
  let service: WebhookService;
  let webhookLogRepo: any;
  let orderRepo: any;
  let transactionRepo: any;
  let cashfreeService: any;
  let erpService: any;

  beforeEach(async () => {
    webhookLogRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'log-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    orderRepo = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    transactionRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'tx-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    cashfreeService = {
      verifyWebhookSignature: jest.fn(),
      generateTestWebhookSignature: jest.fn().mockReturnValue('valid_sig'),
    };

    erpService = {
      syncPaymentStatus: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: getRepositoryToken(WebhookEventLog), useValue: webhookLogRepo },
        { provide: getRepositoryToken(PaymentOrder), useValue: orderRepo },
        { provide: getRepositoryToken(PaymentTransaction), useValue: transactionRepo },
        { provide: CashfreeService, useValue: cashfreeService },
        { provide: ErpService, useValue: erpService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processWebhook', () => {
    const payload: any = {
      data: {
        order: { order_id: 'ORD_001', order_amount: 5000, order_currency: 'INR' },
        payment: {
          cf_payment_id: 123456,
          payment_status: 'SUCCESS',
          payment_amount: 5000,
          payment_currency: 'INR',
          bank_reference: 'REF123',
        },
        customer_details: {
          customer_id: 'STU001',
          customer_name: 'Aarav',
          customer_email: 'a@test.edu',
          customer_phone: '9999999999',
        },
      },
      event_time: '2026-10-03T00:00:00Z',
      type: 'PAYMENT_SUCCESS_WEBHOOK',
    };

    it('should throw UnauthorizedException on invalid signature', async () => {
      cashfreeService.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.processWebhook('invalid_sig', '12345', '{}', payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should process PAYMENT_SUCCESS_WEBHOOK and sync ERP', async () => {
      cashfreeService.verifyWebhookSignature.mockReturnValue(true);
      webhookLogRepo.findOne.mockResolvedValue(null);

      const mockOrder: any = {
        id: 'uuid-1',
        orderId: 'ORD_001',
        erpBillId: 'BILL-001',
        amount: 5000,
        status: PaymentOrderStatus.ACTIVE,
      };
      orderRepo.findOne.mockResolvedValue(mockOrder);

      const result = await service.processWebhook(
        'valid_sig',
        '12345',
        JSON.stringify(payload),
        payload,
      );

      expect(result.status).toBe('SUCCESS');
      expect(orderRepo.save).toHaveBeenCalled();
      expect(mockOrder.status).toBe(PaymentOrderStatus.SUCCESS);
      expect(erpService.syncPaymentStatus).toHaveBeenCalledWith(
        'BILL-001',
        'ORD_001',
        'WEBHOOK_PAYMENT_SUCCESS',
        'SUCCESS',
        5000,
        expect.any(Object),
      );
    });

    it('should acknowledge duplicate webhook idempotently without reprocessing', async () => {
      cashfreeService.verifyWebhookSignature.mockReturnValue(true);
      webhookLogRepo.findOne.mockResolvedValue({
        eventId: 'PAYMENT_SUCCESS_WEBHOOK_123456',
        status: WebhookEventStatus.PROCESSED,
      });

      const result = await service.processWebhook(
        'valid_sig',
        '12345',
        JSON.stringify(payload),
        payload,
      );

      expect(result.status).toBe('DUPLICATE_IGNORED');
      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(erpService.syncPaymentStatus).not.toHaveBeenCalled();
    });
  });
});
