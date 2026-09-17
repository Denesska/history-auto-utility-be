import { Module } from '@nestjs/common';
import { CockpitProfileController } from './cockpit-profile.controller';
import { CockpitProfileService } from './cockpit-profile.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CockpitProfileController],
  providers: [CockpitProfileService],
})
export class CockpitProfileModule {}
