import { Injectable } from '@nestjs/common';
import { Document } from '@prisma/client';
import { DocumentDto } from './dto/document.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentService {
    constructor(private prisma: PrismaService) {}

    async createDocument(data: CreateDocumentDto): Promise<DocumentDto> {
        const document = await this.prisma.document.create({
            data: {
                document_type: data.document_type,
                car_id: data.car_id,
                issue_date: data.issue_date ? new Date(data.issue_date) : null,
                expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
                provider: data.provider ?? null,
                policy_number: data.policy_number ?? null,
                status: data.status ?? 'Active',
                policyholder: data.policyholder ?? null,
                cnp_id: data.cnp_id ?? null,
            },
        });
        return this.toDocumentDto(document);
    }

    async getDocument(id: number): Promise<DocumentDto | null> {
        const document = await this.prisma.document.findUnique({ where: { id } });
        return document ? this.toDocumentDto(document) : null;
    }

    async updateDocument(id: number, data: UpdateDocumentDto): Promise<DocumentDto> {
        const document = await this.prisma.document.update({
            where: { id },
            data: {
                ...(data.document_type !== undefined && { document_type: data.document_type }),
                ...(data.car_id !== undefined && { car_id: data.car_id }),
                ...(data.issue_date !== undefined && { issue_date: data.issue_date ? new Date(data.issue_date) : null }),
                ...(data.expiry_date !== undefined && { expiry_date: data.expiry_date ? new Date(data.expiry_date) : null }),
                ...(data.provider !== undefined && { provider: data.provider }),
                ...(data.policy_number !== undefined && { policy_number: data.policy_number }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.policyholder !== undefined && { policyholder: data.policyholder }),
                ...(data.cnp_id !== undefined && { cnp_id: data.cnp_id }),
            },
        });
        return this.toDocumentDto(document);
    }

    async deleteDocument(id: number): Promise<DocumentDto> {
        const document = await this.prisma.document.delete({ where: { id } });
        return this.toDocumentDto(document);
    }

    async getDocumentsByCarId(carId: number): Promise<DocumentDto[]> {
        const documents = await this.prisma.document.findMany({ where: { car_id: carId } });
        return documents.map(d => this.toDocumentDto(d));
    }

    async updateDocumentFile(id: number, file: Express.Multer.File): Promise<DocumentDto> {
        const document = await this.prisma.document.update({
            where: { id },
            data: {
                file_url: `/uploads/documents/${file.filename}`,
                file_name: file.originalname,
                file_size: file.size,
            },
        });
        return this.toDocumentDto(document);
    }

    private toDocumentDto(document: Document): DocumentDto {
        return {
            id: document.id,
            document_type: document.document_type,
            car_id: document.car_id,
            issue_date: document.issue_date,
            expiry_date: document.expiry_date,
            provider: document.provider,
            policy_number: document.policy_number,
            status: document.status,
            policyholder: document.policyholder,
            cnp_id: document.cnp_id,
            file_url: document.file_url,
            file_name: document.file_name,
            file_size: document.file_size,
        };
    }
}
