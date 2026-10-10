import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
  imports: [PrismaModule, CarAccessModule],
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule {}
