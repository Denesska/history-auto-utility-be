import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeatureAccessService } from './feature-access.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [FeatureAccessService],
  exports: [FeatureAccessService],
})
export class FeaturesModule {}
