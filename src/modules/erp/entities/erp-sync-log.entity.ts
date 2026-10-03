import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('erp_sync_logs')
@Index(['billId'])
@Index(['orderId'])
export class ErpSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bill_id', length: 64 })
  billId: string;

  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ length: 64 })
  event: string;

  @Column({ name: 'previous_status', length: 32, nullable: true })
  previousStatus?: string;

  @Column({ name: 'new_status', length: 32 })
  newStatus: string;

  @Column({ type: 'simple-json', nullable: true })
  details?: Record<string, any>;

  @CreateDateColumn({ name: 'synced_at' })
  syncedAt: Date;
}
