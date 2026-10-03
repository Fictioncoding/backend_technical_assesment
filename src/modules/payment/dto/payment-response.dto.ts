import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentOrderStatus } from '../../../common/constants/payment.constants';

export class PaymentOrderResponseDto {
  @ApiProperty({ example: 'ORD_UMS_1727876428_8F3B' })
  orderId: string;

  @ApiPropertyOptional({ example: 'cf_ord_987654321' })
  cfOrderId?: string;

  @ApiPropertyOptional({
    description: 'Cashfree session token required by Cashfree Web/React/Mobile SDK to open checkout',
    example: 'session_xxxxxxxxxxxxxxxxxxxxxx',
  })
  paymentSessionId?: string;

  @ApiProperty({ example: 'BILL-2026-CS-001' })
  erpBillId: string;

  @ApiProperty({ example: 'STU2026042' })
  studentId: string;

  @ApiProperty({ example: 'Aarav Sharma' })
  studentName: string;

  @ApiProperty({ example: 45000.0 })
  amount: number;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ enum: PaymentOrderStatus, example: PaymentOrderStatus.ACTIVE })
  status: PaymentOrderStatus;

  @ApiPropertyOptional({
    example: 'https://payments-test.cashfree.com/order/#session_xxxxxx',
  })
  checkoutUrl?: string;

  @ApiPropertyOptional({ example: 'https://erp.university.edu/student/fees/receipt?order_id=ORD_UMS_...' })
  returnUrl?: string;

  @ApiProperty({ example: '2026-10-03T00:50:00.000Z' })
  createdAt: Date;
}

export class TransactionSummaryDto {
  @ApiProperty({ example: 'cf_pay_12345678' })
  cfPaymentId: string;

  @ApiProperty({ example: 'SUCCESS' })
  status: string;

  @ApiProperty({ example: 45000.0 })
  amount: number;

  @ApiProperty({ example: 'UPI' })
  paymentMethod?: string;

  @ApiProperty({ example: 'REF89324792374' })
  bankReference?: string;

  @ApiProperty({ example: 'Transaction Successful' })
  paymentMessage?: string;

  @ApiProperty({ example: '2026-10-03T00:51:22.000Z' })
  paymentTime?: Date;
}

export class PaymentVerificationResponseDto {
  @ApiProperty({ example: 'ORD_UMS_1727876428_8F3B' })
  orderId: string;

  @ApiProperty({ example: 'BILL-2026-CS-001' })
  erpBillId: string;

  @ApiProperty({ enum: PaymentOrderStatus, example: PaymentOrderStatus.SUCCESS })
  orderStatus: PaymentOrderStatus;

  @ApiProperty({ example: true })
  isPaid: boolean;

  @ApiProperty({ example: 45000.0 })
  amount: number;

  @ApiProperty({ type: [TransactionSummaryDto] })
  transactions: TransactionSummaryDto[];

  @ApiProperty({
    example: 'ERP Bill updated to PAID and synced successfully',
  })
  erpSyncStatus: string;
}

export class PaymentAnalyticsDto {
  @ApiProperty({ example: 120 })
  totalOrders: number;

  @ApiProperty({ example: 105 })
  successfulOrders: number;

  @ApiProperty({ example: 10 })
  failedOrders: number;

  @ApiProperty({ example: 5 })
  pendingOrders: number;

  @ApiProperty({ example: 4250000.0 })
  totalRevenueCollected: number;

  @ApiProperty({ example: 87.5 })
  successRatePercentage: number;
}
