import type { AgentRunResult } from "../agent/types";
import { runIntelGraph } from "../agent/graph.server";
import { clearToolCache } from "../agent/tools.server";
import { compareRuns, diagnoseTrace } from "./diagnose";
import { fetchTrace, persistTrace, updateDiagnosis } from "./store.server";
import { RunTracer } from "./tracer.server";
import {
  DEFAULT_OPTIMIZATIONS,
  type ChaosSettings,
  type Comparison,
  type Diagnosis,
  type FullTrace,
  type OptimizationConfig,
  type TraceRecord,
} from "./types";

export type ExperimentResult = {
  experimentId: string;
  before: { traceId: string; metrics: TraceRecord };
  after: { traceId: string; metrics: TraceRecord };
  diagnosis: Diagnosis;
  comparison: Comparison[];
  verdict: string;
};

export type SingleRunResult = {
  traceId: string;
  result: AgentRunResult;
  full: FullTrace | null;
};

/** Task-success score (0-100) derived from briefing completeness + self-confidence. */
function scoreRun(r: AgentRunResult): number {
  const b = r.briefing;
  const parts = [
    (b.headline?.length ?? 0) > 12 ? 12 : 0,
    (b.summary?.length ?? 0) > 60 ? 12 : 0,
    Math.min(20, (b.signals?.length ?? 0) * 4),
    Math.min(12, (b.competitor_moves?.length ?? 0) * 4),
    Math.min(10, (b.opportunities?.length ?? 0) * 3),
    Math.min(10, (b.risks?.length ?? 0) * 3),
    Math.min(12, (b.recommended_actions?.length ?? 0) * 3),
    Math.min(12, Math.round((r.critique?.confidence ?? 0) * 12)),
  ];
  return Math.max(0, Math.min(100, Math.round(parts.reduce((a, x) => a + x, 0))));
}

type RunArgs = {
  topic: string;
  competitors?: string;
  chaos: ChaosSettings;
  variant: string;
  experimentId: string | null;
  optimizations: OptimizationConfig;
};

async function runTraced(args: RunArgs): Promise<{ traceId: string; result: AgentRunResult }> {
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

  await persistTrace({
    tracer,
    topic: args.topic,
    variant: args.variant,
    experimentId: args.experimentId,
    chaos: args.chaos,
    optimizations: args.optimizations,
    success: !!result,
    status: result ? "completed" : "failed",
    task_score: result ? scoreRun(result) : 0,
    confidence: Math.round((result?.critique?.confidence ?? 0) * 100),
    summary: {
      headline: result?.briefing?.headline ?? null,
      verdict: result?.critique?.verdict ?? null,
      gaps: result?.critique?.gaps ?? [],
      lanes: result?.lanes?.map((l) => String(l.agent)) ?? [],
      error: failure ? (failure instanceof Error ? failure.message : String(failure)) : null,
    },
  });

  if (!result) throw failure instanceof Error ? failure : new Error("Agent run failed");
  return { traceId: tracer.trace_id, result };
}

export async function runSingleTracedRun(input: {
  topic: string;
  competitors?: string;
  chaos: ChaosSettings;
}): Promise<SingleRunResult> {
  const out = await runTraced({
    topic: input.topic,
    ...(input.competitors ? { competitors: input.competitors } : {}),
    chaos: input.chaos,
    variant: "single",
    experimentId: null,
    optimizations: DEFAULT_OPTIMIZATIONS,
  });
  return { traceId: out.traceId, result: out.result, full: await fetchTrace(out.traceId) };
}

/**
 * before (chaos) -> automatic root-cause diagnosis -> after (remediated) -> comparison.
 */
export async function runExperiment(input: {
  topic: string;
  competitors?: string;
  chaos: ChaosSettings;
}): Promise<ExperimentResult> {
  clearToolCache();
  const experimentId = crypto.randomUUID();
  const common = {
    topic: input.topic,
    ...(input.competitors ? { competitors: input.competitors } : {}),
    chaos: input.chaos,
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
}
