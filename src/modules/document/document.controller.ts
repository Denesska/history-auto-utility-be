import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentDto } from './dto/document.dto';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {RolesGuard} from "../../common/guards/roles/roles.guard";
import {Roles} from "../../common/decorators/roles.decorator";

@ApiTags('document')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('document')
export class DocumentController {
    constructor(private readonly documentService: DocumentService) {}

    @Post()
    @Roles('admin')
    @ApiOperation({ summary: 'Create a new document' })
    @ApiResponse({ status: 201, description: 'The document has been successfully created.', type: DocumentDto })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    async createDocument(@Body() createDocumentDto: CreateDocumentDto): Promise<DocumentDto> {
        return this.documentService.createDocument(createDocumentDto);
    }

    @Get(':id')
    @Roles('user', 'admin')
    @ApiOperation({ summary: 'Get document by ID' })
    @ApiResponse({ status: 200, description: 'Return document details.', type: DocumentDto })
    @ApiResponse({ status: 404, description: 'Document not found.' })
    async getDocument(@Param('id') id: string): Promise<DocumentDto | null> {
        return this.documentService.getDocument(Number(id));
    }

    @Put(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Update a document' })
    @ApiResponse({ status: 200, description: 'The document has been successfully updated.', type: DocumentDto })
    @ApiResponse({ status: 404, description: 'Document not found.' })
    async updateDocument(@Param('id') id: string, @Body() updateDocumentDto: UpdateDocumentDto): Promise<DocumentDto> {
        return this.documentService.updateDocument(Number(id), updateDocumentDto);
    }

    @Delete(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Delete a document' })
    @ApiResponse({ status: 200, description: 'The document has been successfully deleted.', type: DocumentDto })
    @ApiResponse({ status: 404, description: 'Document not found.' })
    async deleteDocument(@Param('id') id: string): Promise<DocumentDto> {
        return this.documentService.deleteDocument(Number(id));
    }

    @Get('car/:carId')
    @Roles('user', 'admin')
    @ApiOperation({ summary: 'Get all documents for a specific car' })
    @ApiResponse({ status: 200, description: 'Return list of documents.', type: [DocumentDto] })
    @ApiResponse({ status: 404, description: 'Documents not found.' })
    async getDocumentsByCarId(@Param('carId') carId: string): Promise<DocumentDto[]> {
        return this.documentService.getDocumentsByCarId(Number(carId));
    }
}
