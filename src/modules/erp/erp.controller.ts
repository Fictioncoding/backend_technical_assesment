import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErpService } from './erp.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { ErpBill } from './entities/erp-bill.entity';
import { ErpSyncLog } from './entities/erp-sync-log.entity';

@ApiTags('ERP Bills (UMS)')
@Controller('erp')
export class ErpController {
  constructor(private readonly erpService: ErpService) {}

  @Post('bills')
  @ApiOperation({ summary: 'Create a student fee bill in University ERP' })
  @ApiResponse({ status: 201, description: 'Bill created successfully', type: ErpBill })
  async createBill(@Body() createBillDto: CreateBillDto): Promise<ErpBill> {
    return this.erpService.createBill(createBillDto);
  }

  @Get('bills')
  @ApiOperation({ summary: 'List all student fee bills in University ERP' })
  @ApiResponse({ status: 200, description: 'List of fee bills', type: [ErpBill] })
  async listBills(): Promise<ErpBill[]> {
    return this.erpService.listBills();
  }

  @Get('bills/:billNumber')
  @ApiOperation({ summary: 'Get details of a specific fee bill' })
  @ApiResponse({ status: 200, description: 'Fee bill details', type: ErpBill })
  async getBill(@Param('billNumber') billNumber: string): Promise<ErpBill> {
    return this.erpService.getBill(billNumber);
  }

  @Get('bills/:billNumber/sync-logs')
  @ApiOperation({ summary: 'Get audit sync history between Payment Module and ERP for this bill' })
  @ApiResponse({ status: 200, description: 'List of sync log entries', type: [ErpSyncLog] })
  async getSyncLogs(@Param('billNumber') billNumber: string): Promise<ErpSyncLog[]> {
    return this.erpService.getSyncLogs(billNumber);
  }
}
