/**
 * What an AI provider adapter reports back about one vendor call, so the caller
 * (which owns the user/org context) can record it through AiUsageService.
 * Adapters must call the reporter at most once per vendor request, with 0 tokens
 * when the vendor does not tell them.
 */
export interface AiCallReport {
    model: string;
    inputTokens: number;
    outputTokens: number;
    status: 'ok' | 'error';
}

export type AiCallReporter = (report: AiCallReport) => void;
