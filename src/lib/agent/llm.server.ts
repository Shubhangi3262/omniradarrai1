import type { TraceEvent } from "./types";

/**
 * Resource-aware, failure-tolerant model client.
 * - hard call budget (resource-aware execution)
 * - retry with backoff (failure recovery)
 * - model fallback chain (tool fallback)
 * - chaos injection for adversarial testing
 */
export const MODEL_CHAIN = [
  "google/gemini-3.7-flash",
  "google/gemini-3.5-flash",
  "openai/gpt-5-mini",
] as const;

export class Budget {
  used = 0;
  failures = 0;
  fallbacks = 0;
  constructor(public limit: number) {}
  get remaining() {
    return Math.max(0, this.limit - this.used);
  }
  get strained() {
    return this.remaining <= Math.max(1, Math.floor(this.limit * 0.3));
  }
}

export type CallOptions = {
  system: string;
  user: string;
  budget: Budget;
  trace: (e: Omit<TraceEvent, "t">) => void;
  node: string;
  chaosFailureRate?: number;
  json?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callModel(opts: CallOptions): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet.");
  if (opts.budget.remaining <= 0) {
    opts.trace({ node: opts.node, status: "warn", message: "Call budget exhausted — degrading step" });
    throw new BudgetExhausted();
  }

  let lastErr = "unknown error";
  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i]!;
    for (let attempt = 0; attempt < 2; attempt++) {
      // adversarial chaos: simulate a flaky retrieval tool
      if (opts.chaosFailureRate && Math.random() < opts.chaosFailureRate) {
        opts.budget.failures++;
        lastErr = "tool outage (injected)";
        opts.trace({
          node: opts.node,
          status: "error",
          message: `${model} tool outage (injected) — attempt ${attempt + 1}`,
        });
        await sleep(120);
        continue;
      }
      try {
        opts.budget.used++;
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model,
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
            messages: [
              { role: "system", content: opts.system },
              { role: "user", content: opts.user },
            ],
          }),
        });
        if (res.status === 429 || res.status >= 500) {
          opts.budget.failures++;
          lastErr = `transient ${res.status}`;
          opts.trace({ node: opts.node, status: "warn", message: `${model} ${res.status} — backing off` });
          await sleep(800 * (attempt + 1));
          continue;
        }
        if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to keep the agent running.");
        if (!res.ok) {
          opts.budget.failures++;
          lastErr = `${res.status} ${(await res.text()).slice(0, 120)}`;
          break; // terminal for this model — fall back
        }
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = json.choices?.[0]?.message?.content ?? "";
        if (!content.trim()) {
          opts.budget.failures++;
          lastErr = "empty completion";
          continue;
        }
        if (i > 0) opts.budget.fallbacks++;
        opts.trace({
          node: opts.node,
          status: i > 0 ? "warn" : "ok",
          message: `${model} responded${i > 0 ? " (fallback model)" : ""}`,
        });
        return content;
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("AI credits")) throw e;
        opts.budget.failures++;
        lastErr = e instanceof Error ? e.message : String(e);
        await sleep(300);
      }
    }
    if (i + 1 < MODEL_CHAIN.length) {
      opts.trace({ node: opts.node, status: "warn", message: `Falling back from ${model}: ${lastErr}` });
    }
  }
  throw new Error(`All model routes failed: ${lastErr}`);
}

export class BudgetExhausted extends Error {
  constructor() {
    super("budget-exhausted");
  }
}

export function parseJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(cleaned.slice(s, e + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
