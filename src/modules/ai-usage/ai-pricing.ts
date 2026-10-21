export interface AiModelPrice {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
}

const DEFAULT_PRICE: AiModelPrice = { inputPerMTokUsd: 1, outputPerMTokUsd: 5 };

export const AI_PRICING: Record<string, AiModelPrice> = {
  'claude-haiku-4-5': { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
  // VERIFY: placeholder price
  'gemini-3.6-flash': { inputPerMTokUsd: 0.5, outputPerMTokUsd: 3 },
  // VERIFY: placeholder price
  '@cf/meta/llama-3.2-11b-vision-instruct': { inputPerMTokUsd: 0.05, outputPerMTokUsd: 0.7 },
};

export function estimateCostUsd(model: string | null | undefined, inputTokens: number, outputTokens: number): number {
  const price = (model && AI_PRICING[model]) || DEFAULT_PRICE;
  return (inputTokens * price.inputPerMTokUsd + outputTokens * price.outputPerMTokUsd) / 1_000_000;
}
