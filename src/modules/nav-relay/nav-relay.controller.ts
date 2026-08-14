import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NavRelayService } from './nav-relay.service';
import { SetNavDto } from './dto/set-nav.dto';
import { NavDestinationDto } from './dto/nav-destination.dto';

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
}
