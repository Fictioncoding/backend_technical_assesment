import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({
    description: 'Unique Bill identifier from the ERP system',
    example: 'BILL-2026-CS-001',
  })
  @IsString()
  @IsNotEmpty()
  erpBillId: string;

  @ApiProperty({
    description: 'Student Registration / Roll number in the University ERP',
    example: 'STU2026042',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Full name of the student',
    example: 'Aarav Sharma',
  })
  @IsString()
  @IsNotEmpty()
  studentName: string;

  @ApiProperty({
    description: 'Valid email address of the student for payment notifications and invoice',
    example: 'aarav.sharma@university.edu.in',
  })
  @IsEmail()
  @IsNotEmpty()
  studentEmail: string;

  @ApiProperty({
    description: '10-digit mobile number of the student',
    example: '9876543210',
  })
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'studentPhone must be a valid 10-digit mobile number',
  })
  studentPhone: string;

  @ApiProperty({
    description: 'Payment amount in INR',
    example: 45000.0,
  })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description: 'Currency code (Default INR)',
    example: 'INR',
    default: 'INR',
  })
  @IsString()
  @IsOptional()
  currency?: string = 'INR';

  @ApiPropertyOptional({
    description: 'Purpose or description of the fee payment',
    example: 'Semester 4 Tuition Fee & Lab Dues',
  })
  @IsString()
  @IsOptional()
  orderNote?: string;

  @ApiPropertyOptional({
    description: 'Custom frontend return URL to redirect the student after payment',
    example: 'https://erp.university.edu/student/fees/receipt?order_id={order_id}',
  })
  @IsString()
  @IsOptional()
  returnUrl?: string;

  @ApiPropertyOptional({
    description: 'Optional client-provided idempotency key for safe retries',
    example: 'idem_key_8f3a9d12',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
