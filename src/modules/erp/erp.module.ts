import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpBill } from './entities/erp-bill.entity';
import { ErpSyncLog } from './entities/erp-sync-log.entity';
import { ErpService } from './erp.service';
import { ErpController } from './erp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ErpBill, ErpSyncLog])],
  controllers: [ErpController],
  providers: [ErpService],
  exports: [ErpService],
})
export class ErpModule {}
