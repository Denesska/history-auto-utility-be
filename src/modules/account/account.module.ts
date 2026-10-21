import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { StorageModule } from '../storage/storage.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [PrismaModule, CryptoModule, StorageModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
