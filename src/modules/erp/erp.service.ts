import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErpBill } from './entities/erp-bill.entity';
import { ErpSyncLog } from './entities/erp-sync-log.entity';
import { CreateBillDto } from './dto/create-bill.dto';
import { ErpBillStatus } from '../../common/constants/payment.constants';

@Injectable()
export class ErpService {
  private readonly logger = new Logger(ErpService.name);

  constructor(
    @InjectRepository(ErpBill)
    private readonly billRepo: Repository<ErpBill>,
    @InjectRepository(ErpSyncLog)
    private readonly syncLogRepo: Repository<ErpSyncLog>,
  ) {}

  /**
   * Create a new student fee bill in ERP
   */
  async createBill(createBillDto: CreateBillDto): Promise<ErpBill> {
    const existing = await this.billRepo.findOne({
      where: { billNumber: createBillDto.billNumber },
    });
    if (existing) {
      return existing;
    }

    const bill = this.billRepo.create({
      ...createBillDto,
      status: ErpBillStatus.UNPAID,
      paidAmount: 0,
    });
    const saved = await this.billRepo.save(bill);
    this.logger.log(`Created ERP Bill: ${saved.billNumber} for Student: ${saved.studentId}`);
    return saved;
  }

  /**
   * Find bill by bill number
   */
  async getBill(billNumber: string): Promise<ErpBill> {
    const bill = await this.billRepo.findOne({ where: { billNumber } });
    if (!bill) {
      throw new NotFoundException(`ERP Bill with number '${billNumber}' not found`);
    }
    return bill;
  }

  /**
   * List all bills in ERP
   */
  async listBills(): Promise<ErpBill[]> {
    return this.billRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Update bill status after payment lifecycle event and write an audit sync log
   */
  async syncPaymentStatus(
    billNumber: string,
    orderId: string,
    event: string,
    paymentStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED',
    paidAmount?: number,
    extraDetails?: Record<string, any>,
  ): Promise<ErpBill> {
    const bill = await this.billRepo.findOne({ where: { billNumber } });
    if (!bill) {
      this.logger.warn(`Cannot sync ERP bill: '${billNumber}' not found`);
      return null;
    }

    const previousStatus = bill.status;
    let newStatus = previousStatus;

    if (paymentStatus === 'SUCCESS') {
      const updatedPaidAmount = Number(bill.paidAmount || 0) + Number(paidAmount || bill.totalAmount);
      bill.paidAmount = updatedPaidAmount;
      if (updatedPaidAmount >= bill.totalAmount) {
        newStatus = ErpBillStatus.PAID;
      } else {
        newStatus = ErpBillStatus.PARTIALLY_PAID;
      }
    } else if (paymentStatus === 'FAILED') {
      if (bill.status !== ErpBillStatus.PAID) {
        newStatus = ErpBillStatus.UNPAID;
      }
    } else if (paymentStatus === 'PENDING') {
      if (bill.status !== ErpBillStatus.PAID) {
        newStatus = ErpBillStatus.PENDING_VERIFICATION;
      }
    } else if (paymentStatus === 'CANCELLED') {
      if (bill.status !== ErpBillStatus.PAID) {
        newStatus = ErpBillStatus.UNPAID;
      }
    }

    bill.status = newStatus;
    const updatedBill = await this.billRepo.save(bill);

    // Record ERP sync audit log
    const syncLog = this.syncLogRepo.create({
      billId: bill.billNumber,
      orderId,
      event,
      previousStatus,
      newStatus,
      details: {
        paidAmount,
        ...extraDetails,
      },
    });
    await this.syncLogRepo.save(syncLog);

    this.logger.log(
      `ERP Bill '${billNumber}' synced: ${previousStatus} -> ${newStatus} (Event: ${event})`,
    );

    return updatedBill;
  }

  /**
   * Get sync logs for a bill
   */
  async getSyncLogs(billNumber: string): Promise<ErpSyncLog[]> {
    return this.syncLogRepo.find({
      where: { billId: billNumber },
      order: { syncedAt: 'DESC' },
    });
  }
}
