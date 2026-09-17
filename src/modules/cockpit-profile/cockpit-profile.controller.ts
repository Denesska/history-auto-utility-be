import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CockpitProfileService } from './cockpit-profile.service';
import { PutProfileDto } from './dto/put-profile.dto';
import { CockpitProfileDto } from './dto/cockpit-profile.dto';

/**
 * The car's settings and saved places, so a reinstalled head unit comes back with everything it had.
 *
 * Unauthenticated in the same deliberate way as the nav relay: the unguessable [slug] is the only
 * credential (see CockpitProfileService.assertSlug), because the head unit has no one to log in as
 * and no way to be asked. Keep the slug secret and make it a different one from the relay's.
 */
@ApiTags('cockpit-profile')
@Controller('p')
export class CockpitProfileController {
  constructor(private readonly profileService: CockpitProfileService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'The profile stored on this channel' })
  @ApiResponse({ status: 200, type: CockpitProfileDto })
  async get(@Param('slug') slug: string): Promise<CockpitProfileDto> {
    return this.profileService.get(slug);
  }

  @Put(':slug')
  @ApiOperation({ summary: 'Store the car profile on this channel' })
  @ApiResponse({ status: 200, type: CockpitProfileDto })
  @ApiResponse({ status: 409, description: 'The stored profile has a higher revision' })
  async put(
    @Param('slug') slug: string,
    @Body() body: PutProfileDto,
  ): Promise<CockpitProfileDto> {
    return this.profileService.put(slug, body);
  }
}
