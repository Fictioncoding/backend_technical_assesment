import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentOrder } from '../modules/payment/entities/payment-order.entity';
import { PaymentTransaction } from '../modules/payment/entities/payment-transaction.entity';
import { WebhookEventLog } from '../modules/payment/entities/webhook-event-log.entity';
import { IdempotencyKey } from '../modules/payment/entities/idempotency-key.entity';
import { ErpBill } from '../modules/erp/entities/erp-bill.entity';
import { ErpSyncLog } from '../modules/erp/entities/erp-sync-log.entity';

export const ENTITIES = [
  PaymentOrder,
  PaymentTransaction,
  WebhookEventLog,
  IdempotencyKey,
  ErpBill,
  ErpSyncLog,
];

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (configService: ConfigService): Promise<TypeOrmModuleOptions> => {
    const dbType = configService.get<string>('database.type', 'postgres');

    if (dbType === 'sqlite') {
      return {
        type: 'sqlite',
        database: configService.get<string>('database.sqliteDatabase', './data/payments.sqlite'),
        entities: ENTITIES,
        synchronize: true,
        logging: ['error', 'warn'],
      };
    }

    return {
      type: 'postgres',
      host: configService.get<string>('database.host', '127.0.0.1'),
      port: configService.get<number>('database.port', 5432),
      username: configService.get<string>('database.username', 'postgres'),
      password: configService.get<string>('database.password', 'postgres'),
      database: configService.get<string>('database.database', 'ums_cashfree_db'),
      entities: ENTITIES,
      synchronize: configService.get<boolean>('database.synchronize', true),
      autoLoadEntities: true,
      logging: ['error', 'warn'],
    };
  },
};
