import { Injectable } from '@nestjs/common';
import { Document, Prisma } from '@prisma/client';
import { DocumentDto } from './dto/document.dto';
import {PrismaService} from "../../prisma/prisma.service";
import {CreateDocumentDto} from "./dto/create-document.dto";

@Injectable()
export class DocumentService {
    constructor(private prisma: PrismaService) {}

    async createDocument(data: CreateDocumentDto): Promise<DocumentDto> {
        const document = await this.prisma.document.create({
            data,
        });
        return this.toDocumentDto(document);
    }

    async getDocument(id: number): Promise<DocumentDto | null> {
        const document = await this.prisma.document.findUnique({
            where: { id },
        });
        return document ? this.toDocumentDto(document) : null;
    }

    async updateDocument(id: number, data: Prisma.DocumentUpdateInput): Promise<DocumentDto> {
        const document = await this.prisma.document.update({
            where: { id },
            data,
        });
        return this.toDocumentDto(document);
    }

    async deleteDocument(id: number): Promise<DocumentDto> {
        const document = await this.prisma.document.delete({
            where: { id },
        });
        return this.toDocumentDto(document);
    }

    async getDocumentsByCarId(carId: number): Promise<DocumentDto[]> {
        const documents = await this.prisma.document.findMany({
            where: { car_id: carId },
        });
        return documents.map(this.toDocumentDto);
    }

    private toDocumentDto(document: Document): DocumentDto {
        return {
            id: document.id,
            document_type: document.document_type,
            issue_date: document.issue_date,
            expiry_date: document.expiry_date,
            car_id: document.car_id,
        };
    }
}
