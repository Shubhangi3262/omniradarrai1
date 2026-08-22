/** Approximate gateway pricing, USD per 1M tokens. Used for cost attribution per span. */
const PRICES: Record<string, { in: number; out: number }> = {
  "google/gemini-3.7-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3.6-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4 },
  "openai/gpt-5": { in: 1.25, out: 10 },
};

const FALLBACK = { in: 0.3, out: 2.5 };

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICES[model] ?? FALLBACK;
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

/** Rough token estimate when the provider omits usage (~4 chars per token). */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}
