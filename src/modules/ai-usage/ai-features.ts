export const AI_FEATURES = ['document_extract', 'identity_extract', 'maintenance_category', 'vehicle_silhouette'] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export type AiProvider = 'gemini' | 'anthropic' | 'cloudflare' | 'cache' | 'none';

export type AiUsageStatus = 'ok' | 'error' | 'cached' | 'blocked';

export type AiBlockReason = 'burst' | 'daily' | 'monthly' | 'blocked' | 'global';
