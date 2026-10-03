import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentOrder } from './entities/payment-order.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { WebhookEventLog } from './entities/webhook-event-log.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { PaymentService } from './services/payment.service';
import { CashfreeService } from './services/cashfree.service';
import { WebhookService } from './services/webhook.service';
import { PaymentController } from './controllers/payment.controller';
import { WebhookController } from './controllers/webhook.controller';
import { ErpModule } from '../erp/erp.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      PaymentOrder,
      PaymentTransaction,
      WebhookEventLog,
      IdempotencyKey,
    ]),
    ErpModule,
  ],
  controllers: [PaymentController, WebhookController],
  providers: [PaymentService, CashfreeService, WebhookService],
  exports: [PaymentService, CashfreeService, WebhookService],
})
export class PaymentModule {}
