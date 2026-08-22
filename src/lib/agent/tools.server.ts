import { Budget, callModel, parseJson } from "./llm.server";
import type { SignalCategory, TraceEvent } from "./types";

/**
 * Tool layer with explicit fallback chains.
 *
 * Every specialist lane calls a *tool*, not the model directly. Each tool has an
 * ordered chain of implementations:
 *   1. live retrieval (model-backed source sweep)
 *   2. degraded retrieval (cheaper prompt, fewer findings)
 *   3. archive recall (memory-only, no model call — always available)
 *
 * Chaos can knock out any implementation; the registry walks the chain so the
 * lane degrades instead of dying.
 */

export type ToolFinding = {
  title: string;
  insight: string;
  impact: "high" | "medium" | "low";
  source_hint: string;
  confidence: number;
};

export type ToolResult = {
  findings: ToolFinding[];
  tool: string;
  degraded: boolean;
};

export type ToolContext = {
  agent: SignalCategory;
  objective: string;
  topic: string;
  competitors: string;
  memoryDigest: string;
  budget: Budget;
  trace: (e: Omit<TraceEvent, "t">) => void;
  chaosFailureRate: number;
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));

function normalise(list: Partial<ToolFinding>[], cap: number): ToolFinding[] {
  return list
    .filter((f) => f && typeof f.title === "string" && typeof f.insight === "string")
    .slice(0, cap)
    .map((f) => ({
      title: f.title!,
      insight: f.insight!,
      impact: (f.impact === "high" || f.impact === "low" ? f.impact : "medium") as ToolFinding["impact"],
      source_hint: f.source_hint || "verify against a primary source",
      confidence: clamp(Number(f.confidence) || 0.5),
    }));
}

async function liveSweep(ctx: ToolContext): Promise<ToolFinding[]> {
  const raw = await callModel({
    node: `tool:live/${ctx.agent}`,
    budget: ctx.budget,
    trace: ctx.trace,
    chaosFailureRate: ctx.chaosFailureRate,
    json: true,
    system: `You are the ${ctx.agent.toUpperCase()} retrieval tool of a multi-agent intelligence system. Report only findings you can justify. Never invent URLs; source_hint names where to verify. Give an honest confidence 0-1 and lower it when unsure. Return JSON {"findings":[{"title":string,"insight":string,"impact":"high|medium|low","source_hint":string,"confidence":number}]} with 2-3 findings.`,
    user: [
      `Task: ${ctx.objective}`,
      `Domain: ${ctx.topic}`,
      ctx.competitors ? `Competitors: ${ctx.competitors}` : "",
      ctx.memoryDigest,
      `Today: ${new Date().toISOString().slice(0, 10)}. Prioritise the last 6 months.`,
      "Keep each insight under 240 characters.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return normalise(parseJson<{ findings: ToolFinding[] }>(raw)?.findings ?? [], 3);
}

async function degradedSweep(ctx: ToolContext): Promise<ToolFinding[]> {
  const raw = await callModel({
    node: `tool:degraded/${ctx.agent}`,
    budget: ctx.budget,
    trace: ctx.trace,
    // the backup tool is deliberately not chaos-injected as often
    chaosFailureRate: ctx.chaosFailureRate * 0.4,
    json: true,
    system:
      'Backup low-cost retrieval tool. Return JSON {"findings":[{"title":string,"insight":string,"impact":"high|medium|low","source_hint":string,"confidence":number}]} with exactly 1 conservative, widely-agreed finding. Confidence must not exceed 0.6.',
    user: `${ctx.objective} (domain: ${ctx.topic}). One short finding only.`,
  });
  return normalise(parseJson<{ findings: ToolFinding[] }>(raw)?.findings ?? [], 1).map((f) => ({
    ...f,
    confidence: Math.min(f.confidence, 0.6),
  }));
}

function archiveRecall(ctx: ToolContext): ToolFinding[] {
  // Memory-based reasoning: zero-cost fallback derived from what the agent already knows.
  const lines = ctx.memoryDigest
    .split("\n")
    .map((l) => l.replace(/^[-\d.\s]+/, "").trim())
    .filter((l) => l.length > 30 && !/^(SHORT|LONG)-TERM MEMORY/i.test(l))
    .slice(0, 2);

  if (!lines.length) return [];
  return lines.map((l) => ({
    title: `Archive recall (${ctx.agent})`,
    insight: `No live source was reachable. Carrying forward a prior observation for continuity: ${l.slice(0, 200)}`,
    impact: "low" as const,
    source_hint: "agent memory — re-verify against a live source",
    confidence: 0.25,
  }));
}

export async function runRetrievalTool(ctx: ToolContext): Promise<ToolResult> {
  const chain: { name: string; run: () => Promise<ToolFinding[]> | ToolFinding[]; degraded: boolean }[] = [
    { name: "live-sweep", run: () => liveSweep(ctx), degraded: false },
    { name: "degraded-sweep", run: () => degradedSweep(ctx), degraded: true },
    { name: "archive-recall", run: () => archiveRecall(ctx), degraded: true },
  ];

  let lastErr = "unknown";
  for (const step of chain) {
    if (step.name !== "archive-recall" && ctx.budget.remaining <= 0) {
      ctx.trace({
        node: `tool:${step.name}`,
        status: "warn",
        message: `Skipping ${step.name}: no execution budget left`,
      });
      continue;
    }
    try {
      const findings = await step.run();
      if (!findings.length) throw new Error("tool returned nothing usable");
      if (step.degraded) {
        ctx.budget.fallbacks++;
        ctx.trace({
          node: `tool:${step.name}`,
          status: "warn",
          message: `Tool fallback engaged for ${ctx.agent} lane (${step.name})`,
        });
      }
      return { findings, tool: step.name, degraded: step.degraded };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      ctx.budget.failures++;
      ctx.trace({
        node: `tool:${step.name}`,
        status: "error",
        message: `${step.name} failed for ${ctx.agent}: ${lastErr} — trying next tool`,
      });
    }
  }
  throw new Error(`all tools failed (${lastErr})`);
}
