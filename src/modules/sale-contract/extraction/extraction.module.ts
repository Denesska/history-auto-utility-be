import { Module } from '@nestjs/common';
import { IdentityExtractionService } from './identity-extraction.service';
import { ClaudeIdentityProvider } from './claude-identity.provider';
import { CloudflareIdentityProvider } from './cloudflare-identity.provider';

/**
 * Identity-document extraction (Romanian CI / buletin).
 *
 * Both adapters are registered unconditionally; each reports itself as disabled
 * when its credentials are missing, exactly like GeminiExtractionService. The
 * facade picks one at runtime from IDENTITY_EXTRACTION_PROVIDER.
 *
 * No imports are needed: ConfigModule is registered globally in AppModule, and
 * the CNP/redaction helpers in src/common/crypto are plain function exports,
 * not providers.
 *
 * Registering this module in AppModule is the SaleContractModule's job — it is
 * intentionally not wired up here.
 */
@Module({
    providers: [ClaudeIdentityProvider, CloudflareIdentityProvider, IdentityExtractionService],
    exports: [IdentityExtractionService, ClaudeIdentityProvider, CloudflareIdentityProvider],
})
export class ExtractionModule {}
