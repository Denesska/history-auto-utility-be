import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from './feature-keys';

export const FEATURE_METADATA_KEY = 'hau:feature';

/**
 * Marks a controller/handler as belonging to a switchable feature. Enforced by
 * FeatureEnforcementInterceptor (403 FEATURE_DISABLED) for business sessions
 * whose organization has the feature switched off. Not mandatory (yet).
 */
export const Feature = (key: FeatureKey) => SetMetadata(FEATURE_METADATA_KEY, key);

/**
 * Handler-level escape from a class-level `@Feature(key)`: marks this one route as
 * belonging to no switchable feature, so it's never gated even while sibling routes
 * on the same controller are. Needed when one handler is shared by multiple verticals
 * (e.g. `POST /document/extract`, used by documents, car registration and sale-contract
 * scans, on a controller otherwise tagged `@Feature('documents')`).
 *
 * Works because `Reflector.getAllAndOverride` takes the first target (handler before
 * class) whose metadata is not `undefined` — explicitly setting it to `null` here wins
 * over the class-level key, and the interceptor already treats a falsy key as "no restriction".
 */
export const NoFeature = () => SetMetadata(FEATURE_METADATA_KEY, null);
