/**
 * Per-organization feature switches (see ACCOUNT-CONTEXT.md, "Feature switches").
 * One key per vertical feature; the list grows as features are added.
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
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
