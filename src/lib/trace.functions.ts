import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AgentRunResult } from "./agent/types";
import { compareRuns, diagnoseTrace } from "./trace/diagnose";
import type { Comparison, Diagnosis, FullTrace, OptimizationConfig, TraceRecord } from "./trace/types";
import { DEFAULT_OPTIMIZATIONS } from "./trace/types";

const ChaosSchema = z.object({
  toolFailureRate: z.number().min(0).max(1).default(0.35),
  injectConflicts: z.boolean().default(true),
  budgetLimit: z.number().min(4).max(40).default(16),
});

const RunInput = z.object({
  topic: z.string().min(2),
  competitors: z.string().optional(),
  chaos: ChaosSchema.default({ toolFailureRate: 0.35, injectConflicts: true, budgetLimit: 16 }),
});

export type TracedRun = {
  traceId: string;
  variant: string;
  result: AgentRunResult;
  metrics: FullTrace["trace"];
};

export type ExperimentResult = {
  experimentId: string;
  before: { traceId: string; metrics: TraceRecord };
  after: { traceId: string; metrics: TraceRecord };
  diagnosis: Diagnosis;
  comparison: Comparison[];
  verdict: string;
};

/** Score how complete/usable the briefing is (0-100) — the task-success metric. */
function scoreRun(r: AgentRunResult): number {
  const b = r.briefing;
  const parts = [
    b.headline?.length > 12 ? 12 : 0,
    b.summary?.length > 60 ? 12 : 0,
    Math.min(20, (b.signals?.length ?? 0) * 4),
    Math.min(12, (b.competitor_moves?.length ?? 0) * 4),
    Math.min(10, (b.opportunities?.length ?? 0) * 3),
    Math.min(10, (b.risks?.length ?? 0) * 3),
    Math.min(12, (b.recommended_actions?.length ?? 0) * 3),
    Math.min(12, Math.round((r.critique?.confidence ?? 0) * 12)),
  ];
  return Math.max(0, Math.min(100, Math.round(parts.reduce((a, x) => a + x, 0))));
}

type InternalRunArgs = {
  topic: string;
  competitors?: string;
  chaos: z.infer<typeof ChaosSchema>;
  variant: string;
  experimentId: string | null;
  optimizations: OptimizationConfig;
};

async function runTraced(args: InternalRunArgs): Promise<{ traceId: string; result: AgentRunResult }> {
  const { runIntelGraph } = await import("./agent/graph.server");
  const { RunTracer } = await import("./trace/tracer.server");
  const { persistTrace } = await import("./trace/store.server");

  const tracer = new RunTracer();
  let result: AgentRunResult | null = null;
  let failure: unknown = null;
  try {
    result = await runIntelGraph({
      topic: args.topic,
      ...(args.competitors ? { competitors: args.competitors } : {}),
      memoryDigest: "SHORT-TERM MEMORY: empty — observability run.",
      chaos: args.chaos,
      optimizations: args.optimizations,
      tracer,
    });
  } catch (e) {
    failure = e;
  }

  const score = result ? scoreRun(result) : 0;
  await persistTrace({
    tracer,
    topic: args.topic,
    variant: args.variant,
    experimentId: args.experimentId,
    chaos: args.chaos,
    optimizations: args.optimizations,
    success: !!result,
    status: result ? "completed" : "failed",
    task_score: score,
    confidence: Math.round((result?.critique?.confidence ?? 0) * 100),
    summary: {
      headline: result?.briefing?.headline ?? null,
      verdict: result?.critique?.verdict ?? null,
      gaps: result?.critique?.gaps ?? [],
      lanes: result?.lanes?.map((l) => l.agent) ?? [],
      error: failure ? (failure instanceof Error ? failure.message : String(failure)) : null,
    },
  });

  if (!result) throw failure instanceof Error ? failure : new Error("Agent run failed");
  return { traceId: tracer.trace_id, result };
}

/** One instrumented run (used by the live console). */
export const runTracedAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data }) => {
    const out = await runTraced({
      topic: data.topic,
      ...(data.competitors ? { competitors: data.competitors } : {}),
      chaos: data.chaos,
      variant: "single",
      experimentId: null,
      optimizations: DEFAULT_OPTIMIZATIONS,
    });
    const { fetchTrace } = await import("./trace/store.server");
    const full = await fetchTrace(out.traceId);
    return { traceId: out.traceId, result: out.result, full };
  });

/**
 * Controlled-failure experiment:
 *  1. BEFORE run with chaos injected (tool outages, tight budget)
 *  2. automatic root-cause diagnosis from the trace
 *  3. AFTER run with the remediation applied, same chaos
 *  4. measurable before-vs-after comparison
 */
export const runObservabilityExperiment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data }): Promise<ExperimentResult> => {
    const { fetchTrace, updateDiagnosis } = await import("./trace/store.server");
    const { clearToolCache } = await import("./agent/tools.server");
    clearToolCache();

    const experimentId = crypto.randomUUID();
    const common = {
      topic: data.topic,
      ...(data.competitors ? { competitors: data.competitors } : {}),
      chaos: data.chaos,
      experimentId,
    };

    const before = await runTraced({ ...common, variant: "before", optimizations: DEFAULT_OPTIMIZATIONS });
    const beforeFull = await fetchTrace(before.traceId);
    if (!beforeFull) throw new Error("Trace for the baseline run could not be read back.");

    const diagnosis = diagnoseTrace(beforeFull);
    await updateDiagnosis(before.traceId, diagnosis);

    const after = await runTraced({ ...common, variant: "after", optimizations: diagnosis.remediation });
    const afterFull = await fetchTrace(after.traceId);
    if (!afterFull) throw new Error("Trace for the optimised run could not be read back.");

    const comparison = compareRuns(beforeFull.trace, afterFull.trace);
    const wins = comparison.filter((c) => c.improved && Math.abs(c.deltaPct) >= 1).length;

    return {
      experimentId,
      before: { traceId: before.traceId, metrics: beforeFull.trace },
      after: { traceId: after.traceId, metrics: afterFull.trace },
      diagnosis,
      comparison,
      verdict:
        wins >= 3
          ? `Remediation improved ${wins} of ${comparison.length} tracked metrics.`
          : wins > 0
            ? `Partial improvement on ${wins} metric(s); the remaining regressions are noted below.`
            : "No measurable improvement — the injected failure was not the dominant cost driver.",
    };
  });

export const listTraces = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTraces } = await import("./trace/store.server");
  return fetchTraces(30);
});

export const getTraceDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ traceId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { fetchTrace } = await import("./trace/store.server");
    return fetchTrace(data.traceId);
  });
