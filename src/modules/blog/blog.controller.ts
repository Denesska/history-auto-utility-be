import {
  BadRequestException,
  Body, Controller, Delete, Get, Param, Patch, Post, Put,
  Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { BlogService } from './blog.service';
import { CreateBlogEntryDto } from './dto/create-blog-entry.dto';
import { UpdateBlogEntryDto } from './dto/update-blog-entry.dto';
import { GetBlogEntriesDto } from './dto/get-blog-entries.dto';
import { BlogEntryDto, VehicleCategoryDto } from './dto/blog-entry.dto';

const blogImageStorage = diskStorage({
  destination: './uploads/blog',
  filename: (_req, file, cb) => cb(null, `${uuid()}${extname(file.originalname)}`),
});

const blogImageFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new BadRequestException('Only image files are allowed'), false);
  }
  cb(null, true);
};

@ApiTags('blog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post('images')
  @ApiOperation({ summary: 'Upload a blog image' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, schema: { properties: { url: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', {
    storage: blogImageStorage,
    fileFilter: blogImageFilter,
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  uploadImage(@UploadedFile() file: Express.Multer.File): { url: string } {
    if (!file) throw new BadRequestException('No file provided');
    return { url: `/uploads/blog/${file.filename}` };
  }

  @Get('categories/vehicle')
  @ApiOperation({ summary: 'Get all vehicle entry categories' })
  @ApiResponse({ status: 200, type: [VehicleCategoryDto] })
  getVehicleCategories(): VehicleCategoryDto[] {
    return this.blogService.getVehicleCategories();
  }

  @Get()
  @ApiOperation({ summary: 'Get all blog entries for authenticated user' })
  @ApiResponse({ status: 200, type: [BlogEntryDto] })
  getEntries(
    @Req() req: RequestWithUser,
    @Query() filters: GetBlogEntriesDto,
  ): Promise<BlogEntryDto[]> {
    return this.blogService.getEntries(req.user.id, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single blog entry' })
  @ApiResponse({ status: 200, type: BlogEntryDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  getEntry(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<BlogEntryDto> {
    return this.blogService.getEntry(Number(id), req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a blog entry' })
  @ApiResponse({ status: 201, type: BlogEntryDto })
  createEntry(
    @Req() req: RequestWithUser,
    @Body() dto: CreateBlogEntryDto,
  ): Promise<BlogEntryDto> {
    return this.blogService.createEntry(req.user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a blog entry' })
  @ApiResponse({ status: 200, type: BlogEntryDto })
  updateEntry(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: UpdateBlogEntryDto,
  ): Promise<BlogEntryDto> {
    return this.blogService.updateEntry(Number(id), req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a blog entry' })
  @ApiResponse({ status: 200, type: BlogEntryDto })
  deleteEntry(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<BlogEntryDto> {
    return this.blogService.deleteEntry(Number(id), req.user.id);
  }

  @Patch(':id/pin')
  @ApiOperation({ summary: 'Toggle pin on a blog entry' })
  @ApiResponse({ status: 200, type: BlogEntryDto })
  togglePin(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<BlogEntryDto> {
    return this.blogService.togglePin(Number(id), req.user.id);
  }
}
