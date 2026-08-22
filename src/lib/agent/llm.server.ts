import { approxTokens } from "../trace/cost";
import type { RunTracer } from "../trace/tracer.server";
import { truncate } from "../trace/tracer.server";
import { DEFAULT_OPTIMIZATIONS, type OptimizationConfig } from "../trace/types";
import type { TraceEvent } from "./types";

/**
 * Resource-aware, failure-tolerant model client.
 * - hard call budget (resource-aware execution)
 * - retry with backoff (failure recovery)
 * - model fallback chain (tool fallback)
 * - chaos injection for adversarial testing
 * - full OpenTelemetry-style span per model attempt (prompt, completion,
 *   tokens, cost, latency, retries, error class)
 */
export const MODEL_CHAIN = DEFAULT_OPTIMIZATIONS.modelOrder;

export class Budget {
  used = 0;
  failures = 0;
  fallbacks = 0;
  /** Attached by the graph so every downstream call is traced. */
  tracer?: RunTracer;
  opt: OptimizationConfig = DEFAULT_OPTIMIZATIONS;
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
  parentSpanId?: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callModel(opts: CallOptions): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  const tracer = opts.budget.tracer;
  const cfg = opts.budget.opt;
  const chain = cfg.modelOrder.length ? cfg.modelOrder : MODEL_CHAIN;
  const maxAttempts = Math.max(1, cfg.maxRetriesPerModel);

  if (!key) throw new Error("AI is not configured yet.");
  if (opts.budget.remaining <= 0) {
    opts.trace({ node: opts.node, status: "warn", message: "Call budget exhausted — degrading step" });
    tracer
      ?.startSpan({
        name: `budget:${opts.node}`,
        kind: "decision",
        parentSpanId: opts.parentSpanId ?? null,
        attributes: { reason: "budget-exhausted", node: opts.node, limit: opts.budget.limit },
      })
      .end("warn");
    throw new BudgetExhausted();
  }

  let lastErr = "unknown error";
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const span = tracer?.startSpan({
        name: `llm:${opts.node}`,
        kind: "llm",
        parentSpanId: opts.parentSpanId ?? null,
        attributes: {
          node: opts.node,
          model,
          attempt,
          fallback: i > 0,
          json_mode: !!opts.json,
          system_prompt: truncate(opts.system, 900),
          user_prompt: truncate(opts.user, 1400),
        },
      });

      // adversarial chaos: simulate a flaky retrieval tool
      if (opts.chaosFailureRate && Math.random() < opts.chaosFailureRate) {
        opts.budget.failures++;
        lastErr = "tool outage (injected)";
        opts.trace({
          node: opts.node,
          status: "error",
          message: `${model} tool outage (injected) — attempt ${attempt + 1}`,
        });
        span?.fail(new Error("tool outage (injected)"), { error_class: "tool_outage", injected: true });
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
          span?.fail(new Error(lastErr), { error_class: "transient", http_status: res.status });
          await sleep(cfg.backoffMs * (attempt + 1));
          continue;
        }
        if (res.status === 402) {
          span?.fail(new Error("payment required"), { error_class: "credits", http_status: 402 });
          throw new Error("AI credits are exhausted. Add credits to keep the agent running.");
        }
        if (!res.ok) {
          opts.budget.failures++;
          lastErr = `${res.status} ${(await res.text()).slice(0, 120)}`;
          span?.fail(new Error(lastErr), { error_class: "terminal", http_status: res.status });
          break; // terminal for this model — fall back
        }

        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        const promptTokens = json.usage?.prompt_tokens ?? approxTokens(opts.system + opts.user);
        const completionTokens = json.usage?.completion_tokens ?? approxTokens(content);

        if (!content.trim()) {
          opts.budget.failures++;
          lastErr = "empty completion";
          span?.usage(model, promptTokens, completionTokens);
          span?.fail(new Error(lastErr), { error_class: "empty" });
          continue;
        }

        if (i > 0) opts.budget.fallbacks++;
        opts.trace({
          node: opts.node,
          status: i > 0 ? "warn" : "ok",
          message: `${model} responded${i > 0 ? " (fallback model)" : ""}`,
        });
        span?.usage(model, promptTokens, completionTokens);
        span?.end(i > 0 ? "warn" : "ok", { completion: truncate(content, 1400) });
        return content;
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("AI credits")) {
          span?.fail(e, { error_class: "credits" });
          throw e;
        }
        opts.budget.failures++;
        lastErr = e instanceof Error ? e.message : String(e);
        span?.fail(e, { error_class: "network" });
        await sleep(300);
      }
    }
    if (i + 1 < chain.length) {
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
