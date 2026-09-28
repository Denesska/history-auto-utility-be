/**
 * Pulls a JSON object out of a model response that may be wrapped in a markdown
 * fence, prefixed with prose ("Sure! Here is the JSON:"), or followed by a
 * closing remark. Returns null when nothing parseable can be recovered.
 *
 * Provider-agnostic: used by any AI adapter (identity extraction, document
 * extraction, ...) that talks to an open-weight model without a schema-
 * constrained response mode.
 */
export function salvageJsonObject(raw: string | undefined | null): Record<string, unknown> | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;

    const candidates: string[] = [text];

    // ```json ... ``` / ``` ... ```
    const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) candidates.push(fenced[1].trim());

    // First balanced { ... } anywhere in the text, ignoring braces inside strings.
    const balanced = extractBalancedObject(text);
    if (balanced) candidates.push(balanced);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // try the next candidate
        }
    }
    return null;
}

function extractBalancedObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}
