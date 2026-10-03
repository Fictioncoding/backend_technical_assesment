export enum PaymentOrderStatus {
  PENDING = 'PENDING',       // Order created internally, payment session initialized
  ACTIVE = 'ACTIVE',         // Active on Cashfree, awaiting student completion
  SUCCESS = 'SUCCESS',       // Payment captured and confirmed by Cashfree
  FAILED = 'FAILED',         // Payment failed or rejected by bank/gateway
  CANCELLED = 'CANCELLED',   // Order cancelled by student or ERP admin
  EXPIRED = 'EXPIRED',       // Payment session expired on Cashfree
}

export enum PaymentTransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  USER_DROPPED = 'USER_DROPPED',
  CANCELLED = 'CANCELLED',
  FLAGGED = 'FLAGGED',
}

export enum ErpBillStatus {
  UNPAID = 'UNPAID',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum WebhookEventStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  DUPLICATE = 'DUPLICATE',
  FAILED = 'FAILED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
}

export const CASHFREE_API_VERSION = '2023-08-01';

export const CASHFREE_SANDBOX_BASE_URL = 'https://sandbox.cashfree.com/pg';
export const CASHFREE_PRODUCTION_BASE_URL = 'https://api.cashfree.com/pg';
