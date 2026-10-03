import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialPaymentSchema1727876428912 implements MigrationInterface {
  name = 'InitialPaymentSchema1727876428912';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payment_orders
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id VARCHAR(64) NOT NULL UNIQUE,
        cf_order_id VARCHAR(64),
        payment_session_id TEXT,
        erp_bill_id VARCHAR(64) NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        student_name VARCHAR(128) NOT NULL,
        student_email VARCHAR(128) NOT NULL,
        student_phone VARCHAR(20) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        return_url TEXT,
        order_note VARCHAR(255),
        metadata TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id ON payment_orders (order_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_erp_bill_id ON payment_orders (erp_bill_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_student_id ON payment_orders (student_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status);`);

    // payment_transactions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
        cf_payment_id VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        payment_method VARCHAR(64),
        payment_group VARCHAR(64),
        bank_reference VARCHAR(128),
        auth_id VARCHAR(128),
        payment_message TEXT,
        failure_reason TEXT,
        raw_gateway_response TEXT,
        payment_time TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_tx_cf_payment_id ON payment_transactions (cf_payment_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON payment_transactions (status);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id ON payment_transactions (payment_order_id);`);

    // webhook_event_logs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhook_event_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(128) NOT NULL UNIQUE,
        event_type VARCHAR(64) NOT NULL,
        order_id VARCHAR(64),
        cf_payment_id VARCHAR(64),
        signature TEXT,
        timestamp_header VARCHAR(64),
        payload TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
        error_message TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id ON webhook_event_logs (event_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_order_id ON webhook_event_logs (order_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_event_logs (status);`);

    // idempotency_keys
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(128) NOT NULL UNIQUE,
        target_resource VARCHAR(64) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        response_code INT,
        response_body TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_keys (key);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys (expires_at);`);

    // erp_bills
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS erp_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bill_number VARCHAR(64) NOT NULL UNIQUE,
        student_id VARCHAR(64) NOT NULL,
        student_name VARCHAR(128) NOT NULL,
        student_email VARCHAR(128) NOT NULL,
        student_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        total_amount DECIMAL(12, 2) NOT NULL,
        paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
        due_date TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_erp_bills_bill_number ON erp_bills (bill_number);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_erp_bills_student_id ON erp_bills (student_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_erp_bills_status ON erp_bills (status);`);

    // erp_sync_logs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS erp_sync_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bill_id VARCHAR(64) NOT NULL,
        order_id VARCHAR(64) NOT NULL,
        event VARCHAR(64) NOT NULL,
        previous_status VARCHAR(32),
        new_status VARCHAR(32) NOT NULL,
        details TEXT,
        synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_erp_sync_logs_bill_id ON erp_sync_logs (bill_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_erp_sync_logs_order_id ON erp_sync_logs (order_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS erp_sync_logs CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS erp_bills CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS idempotency_keys CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_event_logs CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_transactions CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_orders CASCADE;`);
  }
}
