import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';

const { version } = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
) as { version: string };

@ApiTags('version')
@Controller('version')
export class AppVersionController {
  @Get()
  @ApiOperation({ summary: 'Get current backend version' })
  @ApiResponse({ status: 200, description: 'Returns the current app version' })
  getVersion(): { version: string } {
    return { version };
  }
}
