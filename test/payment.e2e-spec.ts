import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as express from 'express';
import { AppModule } from '../src/app.module';
import { CashfreeService } from '../src/modules/payment/services/cashfree.service';

describe('Payment Module & Lifecycle (e2e)', () => {
  let app: INestApplication;
  let cashfreeService: CashfreeService;

  beforeAll(async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.SQLITE_DB_PATH = ':memory:';
    process.env.CASHFREE_MOCK_MODE = 'true';
    process.env.CASHFREE_SECRET_KEY = 'test_e2e_secret_key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');

    // Enable raw body capture for webhook signature verification
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf.toString('utf8');
        },
      }),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
    cashfreeService = moduleFixture.get<CashfreeService>(CashfreeService);
  });

  afterAll(async () => {
    await app.close();
  });

  const testBill = {
    billNumber: 'BILL-E2E-2026-001',
    studentId: 'STU2026E2E',
    studentName: 'Aarav Sharma',
    studentEmail: 'aarav.sharma@university.edu',
    studentPhone: '9876543210',
    title: 'Semester 4 Tuition Fee',
    totalAmount: 25000,
  };

  let createdOrderId: string;

  it('should create student fee bill in ERP', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/erp/bills')
      .send(testBill)
      .expect(201);

    expect(res.body.billNumber).toBe(testBill.billNumber);
    expect(res.body.status).toBe('UNPAID');
    expect(Number(res.body.totalAmount)).toBe(25000);
  });

  it('should initiate payment order with idempotency key', async () => {
    const paymentPayload = {
      erpBillId: testBill.billNumber,
      studentId: testBill.studentId,
      studentName: testBill.studentName,
      studentEmail: testBill.studentEmail,
      studentPhone: testBill.studentPhone,
      amount: 25000,
      currency: 'INR',
      orderNote: 'Semester 4 Tuition',
    };

    const res = await request(app.getHttpServer())
      .post('/api/payments/orders')
      .set('x-idempotency-key', 'idemp_key_e2e_101')
      .send(paymentPayload)
      .expect(201);

    expect(res.body.orderId).toBeDefined();
    expect(res.body.paymentSessionId).toBeDefined();
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.amount).toBe(25000);

    createdOrderId = res.body.orderId;

    // Verify ERP bill is now PENDING_VERIFICATION
    const billRes = await request(app.getHttpServer())
      .get(`/api/erp/bills/${testBill.billNumber}`)
      .expect(200);
    expect(billRes.body.status).toBe('PENDING_VERIFICATION');
  });

  it('should return cached response when resending same idempotency key', async () => {
    const paymentPayload = {
      erpBillId: testBill.billNumber,
      studentId: testBill.studentId,
      studentName: testBill.studentName,
      studentEmail: testBill.studentEmail,
      studentPhone: testBill.studentPhone,
      amount: 25000,
      currency: 'INR',
      orderNote: 'Semester 4 Tuition',
    };

    const res = await request(app.getHttpServer())
      .post('/api/payments/orders')
      .set('x-idempotency-key', 'idemp_key_e2e_101')
      .send(paymentPayload)
      .expect(201);

    expect(res.body.orderId).toBe(createdOrderId);
  });

  it('should return payment order details by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/payments/orders/${createdOrderId}`)
      .expect(200);

    expect(res.body.orderId).toBe(createdOrderId);
    expect(res.body.erpBillId).toBe(testBill.billNumber);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('should process payment success webhook and update bill status to PAID', async () => {
    const timestamp = Date.now().toString();
    const webhookPayload = {
      data: {
        order: {
          order_id: createdOrderId,
          order_amount: 25000,
          order_currency: 'INR',
        },
        payment: {
          cf_payment_id: 88776655,
          payment_status: 'SUCCESS',
          payment_amount: 25000,
          payment_currency: 'INR',
          payment_message: 'Transaction Successful',
          bank_reference: 'UTR99887766',
          payment_group: 'upi',
          payment_method: { upi: { upi_id: 'aarav@okhdfcbank' } },
        },
        customer_details: {
          customer_id: testBill.studentId,
          customer_name: testBill.studentName,
          customer_email: testBill.studentEmail,
          customer_phone: testBill.studentPhone,
        },
      },
      event_time: new Date().toISOString(),
      type: 'PAYMENT_SUCCESS_WEBHOOK',
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = cashfreeService.generateTestWebhookSignature(timestamp, rawBody);

    const res = await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(200);

    expect(res.body.status).toBe('SUCCESS');

    // Verify order is now SUCCESS
    const orderRes = await request(app.getHttpServer())
      .get(`/api/payments/orders/${createdOrderId}`)
      .expect(200);
    expect(orderRes.body.status).toBe('SUCCESS');

    // Verify ERP Bill is now PAID
    const billRes = await request(app.getHttpServer())
      .get(`/api/erp/bills/${testBill.billNumber}`)
      .expect(200);
    expect(billRes.body.status).toBe('PAID');
    expect(Number(billRes.body.paidAmount)).toBe(25000);
  });

  it('should ignore duplicate webhook event idempotently', async () => {
    const timestamp = Date.now().toString();
    const webhookPayload = {
      data: {
        order: { order_id: createdOrderId, order_amount: 25000, order_currency: 'INR' },
        payment: {
          cf_payment_id: 88776655,
          payment_status: 'SUCCESS',
          payment_amount: 25000,
          payment_currency: 'INR',
        },
        customer_details: {
          customer_id: testBill.studentId,
          customer_name: testBill.studentName,
          customer_email: testBill.studentEmail,
          customer_phone: testBill.studentPhone,
        },
      },
      event_time: new Date().toISOString(),
      type: 'PAYMENT_SUCCESS_WEBHOOK',
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = cashfreeService.generateTestWebhookSignature(timestamp, rawBody);

    const res = await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(200);

    expect(res.body.status).toBe('DUPLICATE_IGNORED');
  });

  it('should verify payment status with gateway', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/payments/orders/${createdOrderId}/verify`)
      .expect(200);

    expect(res.body.orderId).toBe(createdOrderId);
    expect(res.body.isPaid).toBe(true);
    expect(res.body.orderStatus).toBe('SUCCESS');
  });

  it('should retrieve erp sync audit logs for bill', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/erp/bills/${testBill.billNumber}/sync-logs`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0].billId).toBe(testBill.billNumber);
  });

  it('should calculate payment analytics metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments/analytics')
      .expect(200);

    expect(res.body.totalOrders).toBeGreaterThanOrEqual(1);
    expect(res.body.successfulOrders).toBeGreaterThanOrEqual(1);
    expect(res.body.totalRevenueCollected).toBe(25000);
    expect(res.body.successRatePercentage).toBe(100);
  });
});
