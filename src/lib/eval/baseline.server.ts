import type { AgentRunResult } from "../agent/types";
import { Budget, callModel, parseJson } from "../agent/llm.server";

/**
 * Baseline comparison: the same objective answered by a single, unassisted LLM
 * call — no planning, no parallel lanes, no conflict adjudication, no critic,
 * no fallbacks. Every agent metric is reported against this control so the
 * evaluation shows what the architecture actually buys.
 */
export async function runBaseline(topic: string, competitors: string): Promise<AgentRunResult> {
  const budget = new Budget(3);
  const raw = await callModel({
    node: "baseline",
    budget,
    trace: () => {},
    json: true,
    system:
      'You are a single-shot analyst. Answer directly in one pass. Return JSON {"headline":string,"summary":string,"signals":[{"category":"research|patent|news|competitor|social","title":string,"insight":string,"impact":"high|medium|low","source_hint":string,"confidence":number}],"competitor_moves":[{"name":string,"move":string,"implication":string}],"opportunities":[string],"risks":[string],"recommended_actions":[string]}',
    user: [`Domain: ${topic}`, competitors ? `Competitors: ${competitors}` : "", "Give 4-5 signals."]
      .filter(Boolean)
      .join("\n"),
  });
  const parsed = parseJson<AgentRunResult["briefing"]>(raw);
  const briefing: AgentRunResult["briefing"] = {
    headline: parsed?.headline ?? "Baseline answer",
    summary: parsed?.summary ?? "",
    signals: parsed?.signals ?? [],
    competitor_moves: parsed?.competitor_moves ?? [],
    opportunities: parsed?.opportunities ?? [],
    risks: parsed?.risks ?? [],
    recommended_actions: parsed?.recommended_actions ?? [],
  };
  return {
    briefing,
    plan: [],
    trace: [],
    conflicts: [],
    hypotheses: [],
    lanes: [],
    critique: { confidence: 0.5, coverage: [], gaps: [], verdict: "Baseline has no self-evaluation.", replans: 0 },
    budget: { limit: budget.limit, used: budget.used, failures: budget.failures, fallbacks: budget.fallbacks },
    threadId: "baseline",
  };
}
