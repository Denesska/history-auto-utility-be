/**
 * Per-organization feature switches (see ACCOUNT-CONTEXT.md, "Feature switches").
 * One key per vertical feature; the list grows as features are added.
 *
 * Adding a key here also means adding it to `AdminFeatureFlagsDto` and
 * `UpdateOrganizationFeaturesDto` (modules/admin/dto/admin-organization.dto.ts) —
 * those list one property per key by hand, and the global ValidationPipe's
 * forbidNonWhitelisted rejects any PATCH key not declared there.
 */
export const FEATURE_KEYS = [
  'supplier',
  'fleet_cost',
  'sale_contract',
  'documents',
  'maintenance',
  'car_notes',
  'car_wishlist',
  'journal',
  'reports',
  'driver_assignment',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
