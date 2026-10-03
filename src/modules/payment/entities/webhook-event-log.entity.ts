import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { WebhookEventStatus } from '../../../common/constants/payment.constants';

@Entity('webhook_event_logs')
@Index(['eventId'], { unique: true })
@Index(['orderId'])
@Index(['cfPaymentId'])
@Index(['status'])
export class WebhookEventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', length: 128, unique: true })
  eventId: string;

  @Column({ name: 'event_type', length: 64 })
  eventType: string;

  @Column({ name: 'order_id', length: 64, nullable: true })
  orderId?: string;

  @Column({ name: 'cf_payment_id', length: 64, nullable: true })
  cfPaymentId?: string;

  @Column({ name: 'signature', type: 'text', nullable: true })
  signature?: string;

  @Column({ name: 'timestamp_header', length: 64, nullable: true })
  timestampHeader?: string;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 32,
    default: WebhookEventStatus.RECEIVED,
  })
  status: WebhookEventStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'processed_at', nullable: true })
  processedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
