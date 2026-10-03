import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from './feature-keys';

export const FEATURE_METADATA_KEY = 'hau:feature';

/**
 * Marks a controller/handler as belonging to a switchable feature. Enforced by
 * FeatureEnforcementInterceptor (403 FEATURE_DISABLED) for business sessions
 * whose organization has the feature switched off. Not mandatory (yet).
 */
export const Feature = (key: FeatureKey) => SetMetadata(FEATURE_METADATA_KEY, key);
