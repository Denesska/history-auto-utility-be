import { Module } from '@nestjs/common';
import { NavRelayController } from './nav-relay.controller';
import { NavRelayService } from './nav-relay.service';
import { NavLinkResolver } from './nav-link.resolver';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NavRelayController],
  providers: [NavRelayService, NavLinkResolver],
})
export class NavRelayModule {}
