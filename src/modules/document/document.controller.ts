import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DocumentService } from './document.service';
import { DocumentExtractionService } from './document-extraction.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentDto } from './dto/document.dto';
import { ExtractionResultDto } from './dto/extraction-result.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const uploadStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, '..', '..', '..', '..', 'uploads', 'documents');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + extname(file.originalname));
  },
});

@ApiTags('document')
@UseGuards(JwtAuthGuard)
@Controller('document')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly extractionService: DocumentExtractionService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  @ApiResponse({ status: 201, type: DocumentDto })
  async createDocument(@Body() createDocumentDto: CreateDocumentDto): Promise<DocumentDto> {
    return this.documentService.createDocument(createDocumentDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, type: DocumentDto })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async getDocument(@Param('id') id: string): Promise<DocumentDto | null> {
    return this.documentService.getDocument(Number(id));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a document' })
  @ApiResponse({ status: 200, type: DocumentDto })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async updateDocument(@Param('id') id: string, @Body() updateDocumentDto: UpdateDocumentDto): Promise<DocumentDto> {
    return this.documentService.updateDocument(Number(id), updateDocumentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  @ApiResponse({ status: 200, type: DocumentDto })
  async deleteDocument(@Param('id') id: string): Promise<DocumentDto> {
    return this.documentService.deleteDocument(Number(id));
  }

  @Get('car/:carId')
  @ApiOperation({ summary: 'Get all documents for a specific car' })
  @ApiResponse({ status: 200, type: [DocumentDto] })
  async getDocumentsByCarId(@Param('carId') carId: string): Promise<DocumentDto[]> {
    return this.documentService.getDocumentsByCarId(Number(carId));
  }

  @Post('extract')
  @ApiOperation({
    summary: 'Extract fields from an uploaded document file (returns suggestions only — does not save)',
    description:
      'Upload a PDF document to have its fields extracted and returned as suggestions. ' +
      'No data is stored. The user must review and confirm the extracted values before saving. ' +
      'Currently supports Romanian RCA insurance PDFs.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 200, type: ExtractionResultDto })
  @ApiResponse({ status: 400, description: 'No file provided or file could not be read.' })
  @ApiResponse({ status: 415, description: 'Unsupported file type.' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async extractDocument(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ExtractionResultDto> {
    if (!file) throw new BadRequestException('No file uploaded. Please attach a file with the field name "file".');
    return this.extractionService.extract(file.buffer, file.mimetype);
  }

  @Post(':id/upload')
  @ApiOperation({ summary: 'Upload a file for a document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, type: DocumentDto })
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage, limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DocumentDto> {
    return this.documentService.updateDocumentFile(Number(id), file);
  }
}
