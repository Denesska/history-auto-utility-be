import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FieldEncryptionService } from './field-encryption.service';

/**
 * Provides application-level field encryption to any feature module that stores personal data.
 *
 * ConfigModule is imported explicitly even though app.module.ts registers it with
 * `isGlobal: true`. The global registration makes ConfigService injectable at runtime, but
 * naming the dependency here keeps this module self-contained — it can be imported into a
 * `Test.createTestingModule` in isolation, and the requirement does not silently disappear if
 * the global flag is ever dropped.
 *
 * Registering this module in app.module.ts is intentionally not done here; it is wired in by
 * whichever feature module needs it (sale-contract, user identity).
 */
@Module({
    imports: [ConfigModule],
    providers: [FieldEncryptionService],
    exports: [FieldEncryptionService],
})
export class CryptoModule {}
