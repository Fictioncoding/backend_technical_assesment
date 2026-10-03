import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

export class CreateBillDto {
  @ApiProperty({
    description: 'Unique bill identifier in the ERP',
    example: 'BILL-2026-CS-001',
  })
  @IsString()
  @IsNotEmpty()
  billNumber: string;

  @ApiProperty({
    description: 'Student Registration / Roll number',
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
    description: 'Student official email address',
    example: 'aarav.sharma@university.edu.in',
  })
  @IsEmail()
  @IsNotEmpty()
  studentEmail: string;

  @ApiProperty({
    description: 'Student 10-digit mobile number',
    example: '9876543210',
  })
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'studentPhone must be a valid 10-digit mobile number',
  })
  studentPhone: string;

  @ApiProperty({
    description: 'Fee title or semester billing description',
    example: 'Semester 4 Tuition Fee',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Total fee amount due in INR',
    example: 45000.0,
  })
  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @ApiPropertyOptional({
    description: 'Due date in ISO format',
    example: '2026-10-31T23:59:59.000Z',
  })
  @IsOptional()
  dueDate?: Date;
}
