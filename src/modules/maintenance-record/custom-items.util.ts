export const CUSTOM_ITEMS_MAX = 10;
export const CUSTOM_ITEM_MAX_LENGTH = 60;

/** Trims, drops empty / over-long entries, dedupes case-insensitively (first spelling wins) and caps the count. */
export function sanitizeCustomItems(items: unknown, maxItems = CUSTOM_ITEMS_MAX, maxLength = CUSTOM_ITEM_MAX_LENGTH): string[] {
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of items) {
        if (typeof raw !== 'string') continue;
        const v = raw.trim();
        if (!v || v.length > maxLength) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
        if (out.length >= maxItems) break;
    }
    return out;
}
