import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NavRelayService } from './nav-relay.service';
import { SetNavDto } from './dto/set-nav.dto';
import {
  NavDestinationDto,
  NavDestinationHistoryDto,
} from './dto/nav-destination.dto';

/**
 * Phone -> car destination relay. Deliberately unauthenticated: the phone shares a Google Maps
 * link with `POST /n/:slug/set`, the car head unit polls `GET /n/:slug/latest`. The unguessable
 * [slug] is the only credential (see NavRelayService.assertSlug); keep it secret.
 */
@ApiTags('nav-relay')
@Controller('n')
export class NavRelayController {
  constructor(private readonly navRelayService: NavRelayService) {}

  @Post(':slug/set')
  @ApiOperation({ summary: 'Share a Google Maps link to the car on this channel' })
  @ApiResponse({ status: 201, type: NavDestinationDto })
  async set(
    @Param('slug') slug: string,
    @Body() body: SetNavDto,
  ): Promise<NavDestinationDto> {
    return this.navRelayService.set(slug, body.url);
  }

  @Get(':slug/latest')
  @ApiOperation({ summary: 'Latest destination shared to the car on this channel' })
  @ApiResponse({ status: 200, type: NavDestinationDto })
  async latest(@Param('slug') slug: string): Promise<NavDestinationDto> {
    return this.navRelayService.latest(slug);
  }

  @Get(':slug/history')
  @ApiOperation({ summary: 'Recent destinations shared on this channel' })
  @ApiResponse({ status: 200, type: NavDestinationHistoryDto })
  async history(
    @Param('slug') slug: string,
  ): Promise<NavDestinationHistoryDto> {
    return this.navRelayService.history(slug);
  }

  @Post(':slug/history/:id/resend')
  @ApiOperation({ summary: 'Resend a previous destination to the car' })
  @ApiResponse({ status: 201, type: NavDestinationDto })
  async resend(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NavDestinationDto> {
    return this.navRelayService.resend(slug, id);
  }
}
