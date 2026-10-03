import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PaymentTransactionStatus } from '../../../common/constants/payment.constants';
import { PaymentOrder } from './payment-order.entity';

@Entity('payment_transactions')
@Index(['cfPaymentId'], { unique: true })
@Index(['status'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_order_id' })
  paymentOrderId: string;

  @ManyToOne(() => PaymentOrder, (order) => order.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder: PaymentOrder;

  @Column({ name: 'cf_payment_id', length: 64, unique: true })
  cfPaymentId: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: PaymentTransactionStatus.PENDING,
  })
  status: PaymentTransactionStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'payment_method', length: 64, nullable: true })
  paymentMethod?: string;

  @Column({ name: 'payment_group', length: 64, nullable: true })
  paymentGroup?: string;

  @Column({ name: 'bank_reference', length: 128, nullable: true })
  bankReference?: string;

  @Column({ name: 'auth_id', length: 128, nullable: true })
  authId?: string;

  @Column({ name: 'payment_message', type: 'text', nullable: true })
  paymentMessage?: string;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @Column({ name: 'raw_gateway_response', type: 'simple-json', nullable: true })
  rawGatewayResponse?: Record<string, any>;

  @Column({ name: 'payment_time', nullable: true })
  paymentTime?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
