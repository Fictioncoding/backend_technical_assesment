import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { CashfreeService } from './cashfree.service';
import { ErpService } from '../../erp/erp.service';
import { ConfigService } from '@nestjs/config';
import { PaymentOrder } from '../entities/payment-order.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { IdempotencyKey } from '../entities/idempotency-key.entity';
import { PaymentOrderStatus, ErpBillStatus } from '../../../common/constants/payment.constants';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let orderRepo: any;
  let transactionRepo: any;
  let idempotencyRepo: any;
  let cashfreeService: any;
  let erpService: any;

  beforeEach(async () => {
    const queryBuilderMock: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalOrders: '4',
        successfulOrders: '2',
        failedOrders: '1',
        pendingOrders: '1',
        totalRevenueCollected: '5000',
      }),
    };

    orderRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'uuid-1', createdAt: new Date() })),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id || 'uuid-1' })),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    transactionRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'tx-uuid-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    idempotencyRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    cashfreeService = {
      createOrder: jest.fn().mockResolvedValue({
        cf_order_id: 'cf_12345',
        payment_session_id: 'session_test_abc',
        order_status: 'ACTIVE',
      }),
      getOrder: jest.fn(),
      getOrderPayments: jest.fn().mockResolvedValue([]),
      getMockMode: jest.fn().mockReturnValue(true),
      getCheckoutUrl: jest
        .fn()
        .mockReturnValue('https://payments-test.cashfree.com/order/#session_test_abc'),
    };

    erpService = {
      getBill: jest.fn().mockResolvedValue({
        billNumber: 'BILL-001',
        totalAmount: 5000,
        status: ErpBillStatus.UNPAID,
      }),
      syncPaymentStatus: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(PaymentOrder), useValue: orderRepo },
        { provide: getRepositoryToken(PaymentTransaction), useValue: transactionRepo },
        { provide: getRepositoryToken(IdempotencyKey), useValue: idempotencyRepo },
        { provide: CashfreeService, useValue: cashfreeService },
        { provide: ErpService, useValue: erpService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'frontendReturnUrl') return 'http://localhost:3000/return?order_id={order_id}';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiatePayment', () => {
    const dto = {
      erpBillId: 'BILL-001',
      studentId: 'STU001',
      studentName: 'Aarav',
      studentEmail: 'aarav@test.edu',
      studentPhone: '9999999999',
      amount: 5000,
    };

    it('should successfully initiate payment and return paymentSessionId', async () => {
      const result = await service.initiatePayment(dto);

      expect(erpService.getBill).toHaveBeenCalledWith('BILL-001');
      expect(cashfreeService.createOrder).toHaveBeenCalled();
      expect(orderRepo.save).toHaveBeenCalled();
      expect(erpService.syncPaymentStatus).toHaveBeenCalledWith(
        'BILL-001',
        expect.any(String),
        'PAYMENT_INITIATED',
        'PENDING',
        5000,
      );

      expect(result).toBeDefined();
      expect(result.orderId).toContain('ORD_UMS_');
      expect(result.paymentSessionId).toBe('session_test_abc');
      expect(result.status).toBe(PaymentOrderStatus.ACTIVE);
    });

    it('should throw BadRequestException if bill is already PAID', async () => {
      erpService.getBill.mockResolvedValueOnce({
        billNumber: 'BILL-001',
        status: ErpBillStatus.PAID,
      });

      await expect(service.initiatePayment(dto)).rejects.toThrow(BadRequestException);
    });

    it('should return cached response when idempotency key is matched', async () => {
      const cached = {
        orderId: 'ORD_CACHED_123',
        cfOrderId: 'cf_12345',
        paymentSessionId: 'session_cached',
        erpBillId: 'BILL-001',
        studentId: 'STU001',
        studentName: 'Aarav',
        amount: 5000,
        currency: 'INR',
        status: PaymentOrderStatus.ACTIVE,
        createdAt: new Date(),
      };

      const requestPayload = JSON.stringify(dto);
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(requestPayload).digest('hex');

      idempotencyRepo.findOne.mockResolvedValueOnce({
        key: 'idem_key_1',
        requestHash: hash,
        responseBody: cached,
      });

      const result = await service.initiatePayment(dto, 'idem_key_1');
      expect(result).toEqual(cached);
      expect(cashfreeService.createOrder).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if idempotency key is reused with different payload', async () => {
      idempotencyRepo.findOne.mockResolvedValueOnce({
        key: 'idem_key_1',
        requestHash: 'different_hash_value',
      });

      await expect(service.initiatePayment(dto, 'idem_key_1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an active order and sync ERP', async () => {
      const existingOrder = {
        id: 'uuid-1',
        orderId: 'ORD_001',
        erpBillId: 'BILL-001',
        status: PaymentOrderStatus.ACTIVE,
      };
      orderRepo.findOne.mockResolvedValue(existingOrder);

      const result = await service.cancelOrder('ORD_001');
      expect(result.status).toBe(PaymentOrderStatus.CANCELLED);
      expect(erpService.syncPaymentStatus).toHaveBeenCalledWith(
        'BILL-001',
        'ORD_001',
        'ORDER_CANCELLED',
        'CANCELLED',
      );
    });
  });

  describe('getAnalytics', () => {
    it('should aggregate analytics metrics correctly using query builder', async () => {
      const analytics = await service.getAnalytics();
      expect(orderRepo.createQueryBuilder).toHaveBeenCalledWith('order');
      expect(analytics.totalOrders).toBe(4);
      expect(analytics.successfulOrders).toBe(2);
      expect(analytics.failedOrders).toBe(1);
      expect(analytics.pendingOrders).toBe(1);
      expect(analytics.totalRevenueCollected).toBe(5000);
      expect(analytics.successRatePercentage).toBe(50.0);
    });
  });
});
