import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhookService } from '../services/webhook.service';
import { CashfreeWebhookPayload } from '../dto/cashfree-webhook.dto';

@ApiTags('Cashfree Webhooks')
@Controller('payments/webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive and process Cashfree Webhook notifications',
    description:
      'Receives webhook notifications from Cashfree PG, validates the cryptographic HMAC SHA-256 signature using the raw body, and triggers state synchronization with UMS/ERP.',
  })
  @ApiHeader({
    name: 'x-webhook-signature',
    required: true,
    description: 'HMAC SHA-256 signature calculated over timestamp + rawBody',
  })
  @ApiHeader({
    name: 'x-webhook-timestamp',
    required: true,
    description: 'Timestamp header sent by Cashfree',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed or acknowledged idempotently',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid webhook signature',
  })
  async handleWebhook(
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Body() payload: CashfreeWebhookPayload,
    @Req() req: Request,
  ) {
    // Extract unparsed raw body if available on request object (from raw body middleware)
    const rawBody = (req as any).rawBody || JSON.stringify(payload);

    return this.webhookService.processWebhook(
      signature,
      timestamp,
      rawBody,
      payload,
    );
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simulate Cashfree webhook event for sandbox testing & evaluation',
    description:
      'Dispatches a cryptographically signed mock webhook to test payment success, failure, or cancellation without requiring external Cashfree tunnel/IP.',
  })
  @ApiResponse({
    status: 200,
    description: 'Simulated webhook event processed',
  })
  async simulateWebhook(
    @Body()
    body: {
      orderId: string;
      status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED';
    },
  ) {
    return this.webhookService.simulateWebhookEvent(body.orderId, body.status);
  }
}
