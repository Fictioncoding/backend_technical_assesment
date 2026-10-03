import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { PaymentOrder } from '../modules/payment/entities/payment-order.entity';
import { PaymentTransaction } from '../modules/payment/entities/payment-transaction.entity';
import { WebhookEventLog } from '../modules/payment/entities/webhook-event-log.entity';
import { IdempotencyKey } from '../modules/payment/entities/idempotency-key.entity';
import { ErpBill } from '../modules/erp/entities/erp-bill.entity';
import { ErpSyncLog } from '../modules/erp/entities/erp-sync-log.entity';

dotenv.config();

const dbType = process.env.DB_TYPE || 'postgres';

let options: DataSourceOptions;

if (dbType === 'sqlite') {
  options = {
    type: 'sqlite',
    database: process.env.SQLITE_DB_PATH || './data/payments.sqlite',
    entities: [
      PaymentOrder,
      PaymentTransaction,
      WebhookEventLog,
      IdempotencyKey,
      ErpBill,
      ErpSyncLog,
    ],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: false,
  };
} else {
  options = {
    type: 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ums_cashfree_db',
    entities: [
      PaymentOrder,
      PaymentTransaction,
      WebhookEventLog,
      IdempotencyKey,
      ErpBill,
      ErpSyncLog,
    ],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: false,
  };
}

export const AppDataSource = new DataSource(options);
