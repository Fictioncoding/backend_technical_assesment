import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PaymentOrderStatus } from '../../../common/constants/payment.constants';
import { PaymentTransaction } from './payment-transaction.entity';

@Entity('payment_orders')
@Index(['orderId'], { unique: true })
@Index(['erpBillId'])
@Index(['studentId'])
@Index(['status'])
export class PaymentOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', length: 64, unique: true })
  orderId: string;

  @Column({ name: 'cf_order_id', length: 64, nullable: true })
  cfOrderId?: string;

  @Column({ name: 'payment_session_id', type: 'text', nullable: true })
  paymentSessionId?: string;

  @Column({ name: 'erp_bill_id', length: 64 })
  erpBillId: string;

  @Column({ name: 'student_id', length: 64 })
  studentId: string;

  @Column({ name: 'student_name', length: 128 })
  studentName: string;

  @Column({ name: 'student_email', length: 128 })
  studentEmail: string;

  @Column({ name: 'student_phone', length: 20 })
  studentPhone: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: PaymentOrderStatus.PENDING,
  })
  status: PaymentOrderStatus;

  @Column({ name: 'return_url', type: 'text', nullable: true })
  returnUrl?: string;

  @Column({ name: 'order_note', length: 255, nullable: true })
  orderNote?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @OneToMany(() => PaymentTransaction, (tx) => tx.paymentOrder)
  transactions: PaymentTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
