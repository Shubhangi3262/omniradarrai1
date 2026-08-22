import {
  DEFAULT_OPTIMIZATIONS,
  type Comparison,
  type Diagnosis,
  type FullTrace,
  type OptimizationConfig,
  type RootCause,
  type SpanRecord,
  type TraceMetrics,
} from "./types";

/**
 * Automatic root-cause analysis over a trace.
 *
 * Pure and deterministic: every rule reads the span tree (errors, latency,
 * retries, token usage, tool outcomes) and emits both a human-readable root
 * cause AND a concrete remediation applied to the next run's config.
 */
export function diagnoseTrace(full: FullTrace): Diagnosis {
  const { trace, spans } = full;
  const base: OptimizationConfig = {
    ...DEFAULT_OPTIMIZATIONS,
    ...trace.optimizations,
    budgetLimit: trace.chaos?.budgetLimit ?? DEFAULT_OPTIMIZATIONS.budgetLimit,
  };
  const remediation: OptimizationConfig = { ...base, modelOrder: [...base.modelOrder], skipLiveSweepFor: [] };
  const causes: RootCause[] = [];
  const rationale: string[] = [];
  const changed: string[] = [];

  const llm = spans.filter((s) => s.kind === "llm");
  const tools = spans.filter((s) => s.kind === "tool");
  const failedTools = tools.filter((s) => s.status === "error");
  const injected = llm.filter((s) => String(s.attributes["error_class"] ?? "") === "tool_outage");
  const transient = llm.filter((s) => String(s.attributes["error_class"] ?? "") === "transient");
  const parseFails = spans.filter((s) => s.attributes["parse_failed"] === true);

  /* 1. Injected/live tool outages -------------------------------------- */
  if (injected.length > 0 || failedTools.length > 0) {
    const laneNames = [...new Set(failedTools.map((s) => laneOf(s.name)).filter(Boolean))] as string[];
    causes.push({
      id: "tool-outage",
      title: "Retrieval tool outages burn budget before the lane degrades",
      severity: injected.length + failedTools.length >= 3 ? "critical" : "high",
      evidence: `${injected.length} injected outage(s) and ${failedTools.length} failed tool span(s); the live sweep retried before falling back${laneNames.length ? ` (lanes: ${laneNames.join(", ")})` : ""}.`,
      affectedSpans: [...injected, ...failedTools].map((s) => s.span_id).slice(0, 12),
      metric: "tool_failures / duration_ms",
      fix: "Trip a circuit breaker on repeatedly failing lanes and route them straight to the backup tool.",
    });
    remediation.circuitBreaker = true;
    remediation.skipLiveSweepFor = laneNames;
    changed.push("circuitBreaker=on", laneNames.length ? `skipLiveSweepFor=${laneNames.join("|")}` : "");
    rationale.push("Failing lanes skip the doomed live sweep, removing a full failed model round-trip each.");
  }

  /* 2. Model-level reliability ------------------------------------------ */
  const byModel = new Map<string, { ok: number; bad: number; ms: number }>();
  for (const s of llm) {
    const m = s.model ?? "unknown";
    const rec = byModel.get(m) ?? { ok: 0, bad: 0, ms: 0 };
    if (s.status === "error") rec.bad++;
    else rec.ok++;
    rec.ms += s.duration_ms;
    byModel.set(m, rec);
  }
  const ranked = [...byModel.entries()]
    .filter(([m]) => m !== "unknown")
    .sort((a, b) => score(b[1]) - score(a[1]))
    .map(([m]) => m);
  if (ranked.length > 1 && ranked[0] !== base.modelOrder[0]) {
    const worst = base.modelOrder[0]!;
    causes.push({
      id: "model-order",
      title: "Primary model in the fallback chain is the least reliable one observed",
      severity: "medium",
      evidence: `${worst} → ${describe(byModel.get(worst))}; ${ranked[0]} → ${describe(byModel.get(ranked[0]!))}.`,
      affectedSpans: llm.filter((s) => s.model === worst).map((s) => s.span_id).slice(0, 8),
      metric: "model_calls / error_count",
      fix: `Promote ${ranked[0]} to the head of the fallback chain.`,
    });
    remediation.modelOrder = [...ranked, ...base.modelOrder.filter((m) => !ranked.includes(m))];
    changed.push(`modelOrder→${remediation.modelOrder[0]}`);
    rationale.push("Reordering the chain removes wasted first-attempt failures.");
  }

  /* 3. Budget exhaustion ------------------------------------------------- */
  const budgetWarn = spans.some((s) => String(s.attributes["reason"] ?? "").includes("budget"));
  const usedRatio = trace.model_calls / Math.max(1, base.budgetLimit);
  if (budgetWarn || usedRatio >= 0.95) {
    causes.push({
      id: "budget",
      title: "Execution budget exhausted — later nodes degraded to heuristics",
      severity: "high",
      evidence: `${trace.model_calls} model calls against a limit of ${base.budgetLimit} (${Math.round(usedRatio * 100)}% consumed).`,
      affectedSpans: spans.filter((s) => String(s.attributes["reason"] ?? "").includes("budget")).map((s) => s.span_id),
      metric: "task_score",
      fix: "Recover the wasted calls with caching instead of simply raising the ceiling.",
    });
    remediation.toolCache = true;
    remediation.budgetLimit = Math.min(40, base.budgetLimit + 4);
    changed.push("toolCache=on", `budgetLimit=${remediation.budgetLimit}`);
    rationale.push("Cached lane retrievals free budget for synthesis and self-evaluation.");
  }

  /* 4. Latency hot spots -------------------------------------------------- */
  const slow = [...llm].sort((a, b) => b.duration_ms - a.duration_ms)[0];
  if (slow && slow.duration_ms > 0.35 * Math.max(1, trace.duration_ms)) {
    causes.push({
      id: "latency",
      title: `Single span "${slow.name}" dominates wall-clock time`,
      severity: "medium",
      evidence: `${slow.duration_ms} ms of ${trace.duration_ms} ms total (${Math.round((slow.duration_ms / Math.max(1, trace.duration_ms)) * 100)}%).`,
      affectedSpans: [slow.span_id],
      metric: "duration_ms",
      fix: "Cache repeat retrievals and cut the number of parallel lanes so the critical path shortens.",
    });
    remediation.toolCache = true;
    if (remediation.maxLanes > 3) {
      remediation.maxLanes = 3;
      changed.push("maxLanes=3");
    }
    changed.push("toolCache=on");
    rationale.push("Fewer, cached lanes shorten the critical path without dropping coverage below three sources.");
  }

  /* 5. Retry storms ------------------------------------------------------- */
  if (transient.length >= 2 || trace.retries >= 3) {
    causes.push({
      id: "retries",
      title: "Retry storm: long fixed backoff multiplies latency on transient errors",
      severity: "medium",
      evidence: `${transient.length} transient upstream error(s), ${trace.retries} retry attempt(s) at ${base.backoffMs} ms base backoff.`,
      affectedSpans: transient.map((s) => s.span_id).slice(0, 8),
      metric: "duration_ms / error_count",
      fix: "Fail over to the next model sooner with a tighter retry budget and shorter backoff.",
    });
    remediation.maxRetriesPerModel = 1;
    remediation.backoffMs = 300;
    changed.push("maxRetriesPerModel=1", "backoffMs=300");
    rationale.push("Failing over faster beats retrying a model that is already degraded.");
  }

  /* 6. Structured-output parse failures ----------------------------------- */
  if (parseFails.length > 0) {
    causes.push({
      id: "parse",
      title: "Model returned unparsable JSON, forcing heuristic fallbacks",
      severity: "medium",
      evidence: `${parseFails.length} span(s) failed strict JSON parsing and fell back to deterministic output.`,
      affectedSpans: parseFails.map((s) => s.span_id).slice(0, 8),
      metric: "task_score",
      fix: "Prefer the model with the best structured-output record and keep JSON mode enforced.",
    });
    if (ranked[0]) remediation.modelOrder = [ranked[0], ...remediation.modelOrder.filter((m) => m !== ranked[0])];
    rationale.push("Structured-output reliability is model-specific; the chain now leads with the best performer.");
  }

  /* 7. Verifier cost/benefit --------------------------------------------- */
  const verifier = spans.find((s) => s.name.includes("verifier"));
  if (verifier && verifier.status !== "ok" && trace.model_calls > 6) {
    causes.push({
      id: "verifier",
      title: "Verifier node spends budget without producing verified hypotheses",
      severity: "low",
      evidence: `Verifier span ended "${verifier.status}" after ${verifier.duration_ms} ms.`,
      affectedSpans: [verifier.span_id],
      metric: "cost_usd",
      fix: "Use the deterministic hypothesis check when the verifier is unhealthy.",
    });
    remediation.fastPathVerifier = true;
    changed.push("fastPathVerifier=on");
    rationale.push("The heuristic verifier costs zero tokens and produced the same verdicts on this trace.");
  }

  if (!causes.length) {
    rationale.push("No structural fault detected; enabling caching to trim redundant retrievals.");
    remediation.toolCache = true;
    changed.push("toolCache=on");
  }

  const penalty =
    causes.reduce((a, c) => a + (c.severity === "critical" ? 34 : c.severity === "high" ? 22 : c.severity === "medium" ? 12 : 6), 0);

  return {
    healthScore: Math.max(0, 100 - penalty),
    rootCauses: causes,
    rationale,
    remediation,
    changed: [...new Set(changed.filter(Boolean))],
  };
}

function score(r: { ok: number; bad: number; ms: number }) {
  const total = r.ok + r.bad || 1;
  return (r.ok / total) * 1000 - r.ms / total / 100;
}
function describe(r?: { ok: number; bad: number; ms: number }) {
  if (!r) return "no calls";
  return `${r.ok} ok / ${r.bad} failed, avg ${Math.round(r.ms / Math.max(1, r.ok + r.bad))} ms`;
}
function laneOf(name: string): string | null {
  const m = /\/(research|patent|news|competitor|social)/.exec(name);
  return m ? m[1]! : null;
}

/** Before-vs-after comparison across every measurable dimension. */
export function compareRuns(before: TraceMetrics, after: TraceMetrics): Comparison[] {
  const defs: { metric: keyof TraceMetrics; label: string; lower: boolean; unit: string }[] = [
    { metric: "duration_ms", label: "Execution time", lower: true, unit: "ms" },
    { metric: "model_calls", label: "Model calls", lower: true, unit: "" },
    { metric: "tool_calls", label: "Tool calls", lower: true, unit: "" },
    { metric: "tool_failures", label: "Tool failures", lower: true, unit: "" },
    { metric: "error_count", label: "Errors", lower: true, unit: "" },
    { metric: "retries", label: "Retries", lower: true, unit: "" },
    { metric: "total_tokens", label: "Tokens used", lower: true, unit: "tok" },
    { metric: "cost_usd", label: "Estimated cost", lower: true, unit: "usd" },
    { metric: "task_score", label: "Task success score", lower: false, unit: "%" },
    { metric: "confidence", label: "Self-reported confidence", lower: false, unit: "%" },
  ];

  return defs.map((d) => {
    const b = Number(before[d.metric] ?? 0);
    const a = Number(after[d.metric] ?? 0);
    const delta = a - b;
    const deltaPct = b === 0 ? (a === 0 ? 0 : 100) : (delta / Math.abs(b)) * 100;
    return {
      metric: String(d.metric),
      label: d.label,
      before: b,
      after: a,
      delta,
      deltaPct,
      betterIsLower: d.lower,
      improved: d.lower ? delta < 0 : delta > 0,
      unit: d.unit,
    };
  });
}
