import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ErpBillStatus } from '../../../common/constants/payment.constants';

@Entity('erp_bills')
@Index(['billNumber'], { unique: true })
@Index(['studentId'])
@Index(['status'])
export class ErpBill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bill_number', length: 64, unique: true })
  billNumber: string;

  @Column({ name: 'student_id', length: 64 })
  studentId: string;

  @Column({ name: 'student_name', length: 128 })
  studentName: string;

  @Column({ name: 'student_email', length: 128 })
  studentEmail: string;

  @Column({ name: 'student_phone', length: 20 })
  studentPhone: string;

  @Column({ length: 255 })
  title: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  paidAmount: number;

  @Column({
    type: 'varchar',
    length: 32,
    default: ErpBillStatus.UNPAID,
  })
  status: ErpBillStatus;

  @Column({ name: 'due_date', nullable: true })
  dueDate?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
