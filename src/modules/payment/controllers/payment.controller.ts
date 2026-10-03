import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentService } from '../services/payment.service';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import {
  PaymentOrderResponseDto,
  PaymentVerificationResponseDto,
  PaymentAnalyticsDto,
} from '../dto/payment-response.dto';
import { PaymentOrder } from '../entities/payment-order.entity';

@ApiTags('Payment Lifecycle (UMS / Cashfree)')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate a new payment order for student fee bill',
    description:
      'Creates a Cashfree PG payment order with session token for frontend checkout. Supports idempotency via x-idempotency-key header.',
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'Unique client-generated key to prevent duplicate payment initiation',
  })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully with Cashfree payment session ID',
    type: PaymentOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid payment parameters or fee already paid' })
  @ApiResponse({ status: 409, description: 'Idempotency conflict (key reused with different payload)' })
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentOrderResponseDto> {
    return this.paymentService.initiatePayment(dto, idempotencyKey);
  }

  @Get('orders/:orderId')
  @ApiOperation({
    summary: 'Get details and transaction history of a payment order',
  })
  @ApiParam({ name: 'orderId', example: 'ORD_UMS_1727876428_8F3B' })
  @ApiResponse({
    status: 200,
    description: 'Order details and all associated payment transactions',
    type: PaymentOrder,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrder(@Param('orderId') orderId: string): Promise<PaymentOrder> {
    return this.paymentService.getOrder(orderId);
  }

  @Get('orders/:orderId/verify')
  @ApiOperation({
    summary: 'Actively verify payment status with Cashfree Gateway and sync ERP',
    description:
      'Polls Cashfree for real-time payment status, updates internal database, and synchronously reconciles the ERP fee bill.',
  })
  @ApiParam({ name: 'orderId', example: 'ORD_UMS_1727876428_8F3B' })
  @ApiResponse({
    status: 200,
    description: 'Verification result and ERP sync status',
    type: PaymentVerificationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async verifyPayment(
    @Param('orderId') orderId: string,
  ): Promise<PaymentVerificationResponseDto> {
    return this.paymentService.verifyPayment(orderId);
  }

  @Post('orders/:orderId/cancel')
  @ApiOperation({
    summary: 'Cancel an active payment order',
  })
  @ApiParam({ name: 'orderId', example: 'ORD_UMS_1727876428_8F3B' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled and ERP bill restored to UNPAID',
    type: PaymentOrder,
  })
  async cancelOrder(@Param('orderId') orderId: string): Promise<PaymentOrder> {
    return this.paymentService.cancelOrder(orderId);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get payment module KPIs and reconciliation metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary KPIs including total volume, success rate, and order counts',
    type: PaymentAnalyticsDto,
  })
  async getAnalytics(): Promise<PaymentAnalyticsDto> {
    return this.paymentService.getAnalytics();
  }
}
