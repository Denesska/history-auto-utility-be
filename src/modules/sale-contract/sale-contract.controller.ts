import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Req,
    ServiceUnavailableException,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { SaleContractService } from './sale-contract.service';
import { IdentityExtractionService } from './extraction/identity-extraction.service';
import { CreateSaleContractDto } from './dto/create-sale-contract.dto';
import { UpdateSaleContractDto } from './dto/update-sale-contract.dto';
import { GenerateSaleContractDto } from './dto/generate-sale-contract.dto';
import { SaleContractDto, SaleContractFileLinkDto, SaleContractSummaryDto } from './dto/sale-contract.dto';
import { IdentityExtractionResultDto } from './dto/identity-extraction.dto';
import { SaveUserIdentityDto, UserIdentityDto } from './dto/user-identity.dto';
import { IdentityExtractionUnavailableError } from './sale-contract.types';

/** Identity photos are held in memory only — see the note on the extract route. */
const IDENTITY_UPLOAD_LIMIT_BYTES = 15 * 1024 * 1024;

@ApiTags('sale-contract')
@UseGuards(JwtAuthGuard)
@Controller('sale-contract')
export class SaleContractController {
    constructor(
        private readonly saleContractService: SaleContractService,
        private readonly identityExtraction: IdentityExtractionService,
    ) {}

    // NOTE ON ROUTE ORDER: every literal path below must stay declared before
    // the ':id' routes, or Nest matches 'my-identity' as an id and the request
    // dies in ParseIntPipe.

    @Post('extract-identity')
    @ApiOperation({
        summary: 'Read the fields off a photo of an identity document (returns suggestions only)',
        description:
            'The photo is processed in memory and never written to disk or to object storage, and nothing is ' +
            'saved by this endpoint. The user reviews and confirms every field before it is stored. ' +
            'Processing the identity document of the other party to the sale requires that person\'s agreement; ' +
            'the caller states which version of the consent wording was shown.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                consent_version: { type: 'string', example: '2026-09-v1' },
            },
            required: ['file', 'consent_version'],
        },
    })
    @ApiResponse({ status: 200, type: IdentityExtractionResultDto })
    @ApiResponse({ status: 400, description: 'No file provided, or consent not stated.' })
    @ApiResponse({ status: 503, description: 'The extraction provider is temporarily unavailable.' })
    @UseInterceptors(
        FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: IDENTITY_UPLOAD_LIMIT_BYTES } }),
    )
    async extractIdentity(
        @UploadedFile() file: Express.Multer.File,
        @Body('consent_version') consentVersion: string,
    ): Promise<IdentityExtractionResultDto> {
        if (!file) throw new BadRequestException('No file uploaded. Attach the photo under the field name "file".');
        if (!consentVersion?.trim()) {
            throw new BadRequestException(
                'consent_version is required: the person whose document is being read has to have agreed to it.',
            );
        }

        try {
            const result = await this.identityExtraction.extract(file.buffer, file.mimetype);
            if (!result) {
                return {
                    detected: false,
                    confidence: 'low',
                    fields: {},
                    warnings: ['Documentul nu a putut fi recunoscut. Completează datele manual.'],
                    provider: 'none',
                };
            }
            return result;
        } catch (err) {
            if (err instanceof IdentityExtractionUnavailableError) {
                throw new ServiceUnavailableException(
                    'Serviciul de citire a actelor este momentan indisponibil. Încearcă din nou sau completează manual.',
                );
            }
            throw err;
        }
    }

    @Get('my-identity')
    @ApiOperation({ summary: 'The signed-in user\'s own saved contract details' })
    @ApiResponse({ status: 200, type: UserIdentityDto })
    async getMyIdentity(@Req() req: RequestWithUser): Promise<UserIdentityDto> {
        return this.saleContractService.getMyIdentity(req.user.google_id);
    }

    @Put('my-identity')
    @ApiOperation({
        summary: 'Save the user\'s own details, so they are not re-entered for every contract',
    })
    @ApiResponse({ status: 200, type: UserIdentityDto })
    async saveMyIdentity(@Req() req: RequestWithUser, @Body() dto: SaveUserIdentityDto): Promise<UserIdentityDto> {
        return this.saleContractService.saveMyIdentity(req.user.google_id, dto);
    }

    @Delete('my-identity')
    @HttpCode(204)
    @ApiOperation({ summary: 'Erase the user\'s saved details' })
    @ApiResponse({ status: 204, description: 'Erased.' })
    async deleteMyIdentity(@Req() req: RequestWithUser): Promise<void> {
        await this.saleContractService.deleteMyIdentity(req.user.google_id);
    }

    @Get()
    @ApiOperation({
        summary: 'List the user\'s contracts',
        description: 'Carries no personal data — listing never decrypts the parties.',
    })
    @ApiResponse({ status: 200, type: [SaleContractSummaryDto] })
    async list(@Req() req: RequestWithUser): Promise<SaleContractSummaryDto[]> {
        return this.saleContractService.list(req.user.google_id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a contract draft' })
    @ApiResponse({ status: 201, type: SaleContractDto })
    async create(@Req() req: RequestWithUser, @Body() dto: CreateSaleContractDto): Promise<SaleContractDto> {
        return this.saleContractService.create(req.user.google_id, dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get one contract, with the parties decrypted' })
    @ApiResponse({ status: 200, type: SaleContractDto })
    @ApiResponse({ status: 404, description: 'Not found, or not yours.' })
    async get(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number): Promise<SaleContractDto> {
        return this.saleContractService.get(req.user.google_id, id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a contract draft' })
    @ApiResponse({ status: 200, type: SaleContractDto })
    async update(
        @Req() req: RequestWithUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateSaleContractDto,
    ): Promise<SaleContractDto> {
        return this.saleContractService.update(req.user.google_id, id, dto);
    }

    @Post(':id/generate')
    @ApiOperation({
        summary: 'Generate the filled ITL 054 form as a PDF',
        description:
            'Every confirmation in the body must be true — the request is rejected otherwise. Those tick boxes ' +
            'are an in-app checkpoint recording that the user verified the data and was shown the declarations ' +
            'printed at section (5); they are not added to the form, which must stay the standard one.',
    })
    @ApiResponse({ status: 201, type: SaleContractFileLinkDto })
    @ApiResponse({ status: 400, description: 'A confirmation was missing or false.' })
    async generate(
        @Req() req: RequestWithUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: GenerateSaleContractDto,
    ): Promise<SaleContractFileLinkDto> {
        return this.saleContractService.generate(req.user.google_id, id, dto);
    }

    @Get(':id/download')
    @ApiOperation({ summary: 'A fresh signed download link for an already generated contract' })
    @ApiResponse({ status: 200, type: SaleContractFileLinkDto })
    @ApiResponse({ status: 404, description: 'Not generated yet.' })
    async download(
        @Req() req: RequestWithUser,
        @Param('id', ParseIntPipe) id: number,
    ): Promise<SaleContractFileLinkDto> {
        return this.saleContractService.getDownloadLink(req.user.google_id, id);
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({
        summary: 'Delete a contract and its stored PDF',
        description: 'A real delete: the row and the stored file both go, not a status flag.',
    })
    @ApiResponse({ status: 204, description: 'Deleted.' })
    async remove(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.saleContractService.remove(req.user.google_id, id);
    }
}
