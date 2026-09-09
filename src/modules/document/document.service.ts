import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Document } from '@prisma/client';
import { DocumentDto } from './dto/document.dto';
import { DocumentFileLinkDto } from './dto/document-file-link.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentService {
    private readonly signedUrlExpiry: number;
    private readonly apiBaseUrl: string;

    constructor(
        private prisma: PrismaService,
        private storage: StorageService,
        config: ConfigService,
    ) {
        this.signedUrlExpiry = Number(config.get<string>('R2_SIGNED_URL_EXPIRY') ?? '3600');
        this.apiBaseUrl = (config.get<string>('API_BASE_URL') ?? '').replace(/\/+$/, '');
    }

    async createDocument(data: CreateDocumentDto): Promise<DocumentDto> {
        const document = await this.prisma.document.create({
            data: {
                document_type: data.document_type,
                car_id: data.car_id,
                issue_date: data.issue_date ? new Date(data.issue_date) : null,
                expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
                provider: data.provider ?? null,
                policy_series: data.policy_series ?? null,
                policy_number: data.policy_number ?? null,
                premium: data.premium ?? null,
                currency: data.currency ?? null,
                bonus_malus_class: data.bonus_malus_class ?? null,
                status: data.status ?? 'Active',
                policyholder: data.policyholder ?? null,
                cnp_id: data.cnp_id ?? null,
                is_active: data.is_active ?? true,
            },
        });
        return await this.toDocumentDto(document);
    }

    async getDocument(id: number): Promise<DocumentDto | null> {
        const document = await this.prisma.document.findUnique({ where: { id } });
        return document ? await this.toDocumentDto(document) : null;
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
                ...(data.policy_series !== undefined && { policy_series: data.policy_series }),
                ...(data.policy_number !== undefined && { policy_number: data.policy_number }),
                ...(data.premium !== undefined && { premium: data.premium }),
                ...(data.currency !== undefined && { currency: data.currency }),
                ...(data.bonus_malus_class !== undefined && { bonus_malus_class: data.bonus_malus_class }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.policyholder !== undefined && { policyholder: data.policyholder }),
                ...(data.cnp_id !== undefined && { cnp_id: data.cnp_id }),
                ...(data.is_active !== undefined && { is_active: data.is_active }),
            },
        });
        return await this.toDocumentDto(document);
    }

    async deleteDocument(id: number): Promise<DocumentDto> {
        const document = await this.prisma.document.delete({ where: { id } });
        return await this.toDocumentDto(document);
    }

    async getDocumentsByCarId(carId: number): Promise<DocumentDto[]> {
        const documents = await this.prisma.document.findMany({ where: { car_id: carId } });
        return Promise.all(documents.map(d => this.toDocumentDto(d)));
    }

    async getAllDocumentsByUser(googleId: string): Promise<DocumentDto[]> {
        const documents = await this.prisma.document.findMany({
            where: {
                OR: [
                    { car: { user: { google_id: googleId } } },
                    { car: { access_entries: { some: { user: { google_id: googleId }, accepted_at: { not: null } } } } },
                ],
            },
        });
        return Promise.all(documents.map(d => this.toDocumentDto(d)));
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
        return await this.toDocumentDto(document);
    }

    /**
     * A short-lived link to the document's attached file, resolved fresh on every
     * call — the `file_url` carried by DocumentDto is signed at read time and goes
     * stale in the frontend's cached state, so anything the user actually clicks
     * (preview, download) asks for a new one here.
     *
     * Access is checked against the car: the owner, or someone the car has been
     * shared with and who accepted the invitation.
     */
    async getFileLink(id: number, googleId: string, download: boolean): Promise<DocumentFileLinkDto> {
        const document = await this.prisma.document.findFirst({
            where: {
                id,
                OR: [
                    { car: { user: { google_id: googleId } } },
                    { car: { access_entries: { some: { user: { google_id: googleId }, accepted_at: { not: null } } } } },
                ],
            },
        });

        if (!document) throw new NotFoundException('Document not found');
        if (!document.file_url) throw new NotFoundException('This document has no file attached');

        const fileName = document.file_name ?? document.file_url.split('/').pop() ?? 'document';

        return {
            url: await this.buildFileLink(document.file_url, download ? fileName : undefined),
            file_name: fileName,
            file_size: document.file_size,
            expires_in: this.signedUrlExpiry,
        };
    }

    private async toDocumentDto(document: Document): Promise<DocumentDto> {
        return {
            id: document.id,
            document_type: document.document_type,
            car_id: document.car_id,
            issue_date: document.issue_date,
            expiry_date: document.expiry_date,
            provider: document.provider,
            policy_series: document.policy_series,
            policy_number: document.policy_number,
            premium: document.premium,
            currency: document.currency,
            bonus_malus_class: document.bonus_malus_class,
            status: document.status,
            policyholder: document.policyholder,
            cnp_id: document.cnp_id,
            file_url: await this.resolveFileUrl(document.file_url),
            file_name: document.file_name,
            file_size: document.file_size,
            is_active: document.is_active,
        };
    }

    private resolveFileUrl(url: string | null): Promise<string | null> | string | null {
        if (!url) return url;
        if (url.startsWith('http')) return url;
        // Files uploaded before the R2 migration live on the backend's own disk,
        // served from /uploads — a path that only resolves against the API host,
        // not against the app (native builds have no host at all).
        if (url.startsWith('/')) return this.apiBaseUrl ? `${this.apiBaseUrl}${url}` : url;
        return this.storage.createPresignedGetUrl(url);
    }

    private buildFileLink(storedUrl: string, downloadFileName?: string): Promise<string> | string {
        if (storedUrl.startsWith('http')) return storedUrl;
        if (storedUrl.startsWith('/')) return this.apiBaseUrl ? `${this.apiBaseUrl}${storedUrl}` : storedUrl;
        return this.storage.createPresignedGetUrl(storedUrl, this.signedUrlExpiry, downloadFileName);
    }
}
