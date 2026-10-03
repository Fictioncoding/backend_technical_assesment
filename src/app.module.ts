import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { typeOrmAsyncConfig } from './config/database.config';
import { PaymentModule } from './modules/payment/payment.module';
import { ErpModule } from './modules/erp/erp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    PaymentModule,
    ErpModule,
  ],
})
export class AppModule {}
