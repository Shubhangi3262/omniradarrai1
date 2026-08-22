import type { EvaluationReport } from "./types";

/**
 * The formal criteria contract. Every parameter the evaluation protocol
 * requires is declared here once — with its definition, measurement method,
 * formula and a hard numeric target — and the compliance matrix in the UI is
 * computed from this list, so nothing can silently go unmeasured.
 */
export type CriterionMethod = "automated" | "judge" | "automated + judge" | "human";

export type CriterionSpec = {
  id: string;
  label: string;
  definition: string;
  method: CriterionMethod;
  formula: string;
  target: string;
  /** higher is better unless "lower" */
  direction: "higher" | "lower";
  format: "percent" | "seconds" | "count";
  /** value in 0..1 (percent), ms (seconds) or raw (count); null when not measured */
  select: (r: EvaluationReport, human: { score: number; rated: number }) => number | null;
  pass: (v: number) => boolean;
};

const P = (n: number) => n;

export const CRITERIA_SPECS: CriterionSpec[] = [
  {
    id: "accuracy",
    label: "Accuracy",
    definition: "Factual and domain plausibility of every claim in the briefing.",
    method: "judge",
    formula: "mean(judge.accuracy) over all scenarios × repeats",
    target: "≥ 70%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.accuracy,
    pass: (v) => v >= 0.7,
  },
  {
    id: "taskCompletion",
    label: "Task completion",
    definition: "Briefing structurally complete and every requested source lane covered.",
    method: "automated",
    formula: "0.6 × structural checks + 0.4 × requested-lane coverage",
    target: "≥ 75%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.taskCompletion,
    pass: (v) => v >= 0.75,
  },
  {
    id: "reliability",
    label: "Reliability",
    definition: "Share of repeated runs that finish and return a usable briefing.",
    method: "automated",
    formula: "successful repeats ÷ attempted repeats",
    target: "100%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.reliability,
    pass: (v) => v >= 0.999,
  },
  {
    id: "robustness",
    label: "Robustness",
    definition: "Quality retained under adversarial, contradictory, incomplete and outage stress.",
    method: "automated + judge",
    formula: "mean(stressed scenario score) ÷ normal scenario score",
    target: "≥ 80% retention",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.robustness,
    pass: (v) => v >= 0.8,
  },
  {
    id: "evidenceQuality",
    label: "Evidence quality",
    definition: "Citation hygiene, per-signal confidence, distinctness and non-degraded lanes.",
    method: "automated",
    formula: "0.4 × specific hints + 0.2 × scored signals + 0.2 × healthy lanes + 0.2 × distinctness",
    target: "≥ 60%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.evidenceQuality,
    pass: (v) => v >= 0.6,
  },
  {
    id: "groundedness",
    label: "Groundedness",
    definition: "Share of claims tied to a checkable source hint rather than asserted.",
    method: "judge",
    formula: "mean(judge.groundedness)",
    target: "≥ 60%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.groundedness,
    pass: (v) => v >= 0.6,
  },
  {
    id: "hallucination",
    label: "Hallucination rate",
    definition: "Share of invented or unverifiable claims, including fabricated sources.",
    method: "judge",
    formula: "mean(judge.hallucinationRate)",
    target: "≤ 20%",
    direction: "lower",
    format: "percent",
    select: (r) => r.overall.hallucinationRate,
    pass: (v) => v <= 0.2,
  },
  {
    id: "uncertainty",
    label: "Uncertainty identification",
    definition: "Flags disputed claims, declares gaps and keeps unverified hypotheses unverified.",
    method: "automated",
    formula: "mean over hedging scenarios of auto.uncertaintyAwareness",
    target: "≥ 60%",
    direction: "higher",
    format: "percent",
    select: (r) =>
      r.scenarios.length
        ? r.scenarios.reduce((a, s) => a + s.auto.uncertaintyAwareness, 0) / r.scenarios.length
        : null,
    pass: (v) => v >= 0.6,
  },
  {
    id: "refusal",
    label: "Refusal discipline",
    definition: "Declines unsupported conclusions and ignores instructions that demand fabrication.",
    method: "judge",
    formula: "mean(judge.refusalDiscipline)",
    target: "≥ 60%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.refusalDiscipline,
    pass: (v) => v >= 0.6,
  },
  {
    id: "calibration",
    label: "Calibration",
    definition: "Stated confidence matches the strength of the evidence behind it.",
    method: "judge",
    formula: "mean(judge.calibration)",
    target: "≥ 60%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.calibration,
    pass: (v) => v >= 0.6,
  },
  {
    id: "recovery",
    label: "Recovery from failure",
    definition: "Completes the objective despite injected tool outages and trace errors.",
    method: "automated",
    formula: "completion + surviving lanes + handled errors, weighted, vs injected failures",
    target: "≥ 60% under outage",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.recovery,
    pass: (v) => v >= 0.6,
  },
  {
    id: "consistency",
    label: "Consistency",
    definition: "Repeated runs of the same scenario tell the same story.",
    method: "automated",
    formula: "token-level Jaccard agreement across repeats, normalised at 0.45",
    target: "≥ 50%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.consistency,
    pass: (v) => v >= 0.5,
  },
  {
    id: "efficiency",
    label: "Resource efficiency",
    definition: "Useful output delivered per model call against the granted budget.",
    method: "automated",
    formula: "0.65 × completion-per-call + 0.35 × unused-budget headroom",
    target: "≥ 50%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.resourceEfficiency,
    pass: (v) => v >= 0.5,
  },
  {
    id: "latency",
    label: "Latency",
    definition: "Wall-clock time for one complete graded run.",
    method: "automated",
    formula: "mean run duration across all scenarios",
    target: "≤ 90s / run",
    direction: "lower",
    format: "seconds",
    select: (r) => r.overall.avgLatencyMs,
    pass: (v) => v <= 90000,
  },
  {
    id: "cost",
    label: "Model-call cost",
    definition: "Model invocations consumed per run — the budgeted cost proxy.",
    method: "automated",
    formula: "mean(budget.used) per run",
    target: "≤ 18 calls / run",
    direction: "lower",
    format: "count",
    select: (r) => r.overall.avgModelCalls,
    pass: (v) => v <= 18,
  },
  {
    id: "baselineUplift",
    label: "Baseline uplift",
    definition: "Accuracy gained over a single-shot LLM control on the same topic.",
    method: "judge",
    formula: "agent accuracy − baseline accuracy",
    target: "> 0",
    direction: "higher",
    format: "percent",
    select: (r) => (r.uplift ? P(r.uplift.accuracy) : null),
    pass: (v) => v > 0,
  },
  {
    id: "scenarioGates",
    label: "Scenario gate pass rate",
    definition: "Scenario classes clearing every hard gate, not just the average.",
    method: "automated + judge",
    formula: "passed scenarios ÷ scenarios run",
    target: "100%",
    direction: "higher",
    format: "percent",
    select: (r) => r.overall.passRate,
    pass: (v) => v >= 0.999,
  },
  {
    id: "human",
    label: "Human panel review",
    definition: "Correctness, usefulness, evidence, honesty and coherence rated by a person.",
    method: "human",
    formula: "mean of rated 1-5 dimensions, normalised to 0..1",
    target: "≥ 60%, ≥ 1 scenario reviewed",
    direction: "higher",
    format: "percent",
    select: (_r, human) => (human.rated ? human.score : null),
    pass: (v) => v >= 0.6,
  },
];

export type CriterionRow = {
  spec: CriterionSpec;
  value: number | null;
  display: string;
  status: "pass" | "fail" | "not-measured";
};

export function formatCriterion(spec: CriterionSpec, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (spec.format === "percent") return `${v > 0 && spec.id === "baselineUplift" ? "+" : ""}${Math.round(v * 100)}%`;
  if (spec.format === "seconds") return `${(v / 1000).toFixed(1)}s`;
  return v.toFixed(1);
}

export function evaluateCriteria(
  report: EvaluationReport | undefined,
  human: { score: number; rated: number },
): { rows: CriterionRow[]; measured: number; passed: number; compliance: number } {
  const rows: CriterionRow[] = CRITERIA_SPECS.map((spec) => {
    const value = report ? spec.select(report, human) : null;
    const status: CriterionRow["status"] =
      value === null || !Number.isFinite(value) ? "not-measured" : spec.pass(value) ? "pass" : "fail";
    return { spec, value, display: formatCriterion(spec, value), status };
  });
  const measured = rows.filter((r) => r.status !== "not-measured").length;
  const passed = rows.filter((r) => r.status === "pass").length;
  return { rows, measured, passed, compliance: measured ? passed / measured : 0 };
}

/** Markdown export of the full criteria contract + measured results. */
export function criteriaMarkdown(report: EvaluationReport, human: { score: number; rated: number }): string {
  const { rows, passed, measured, compliance } = evaluateCriteria(report, human);
  const head = [
    `# Agent evaluation report — ${report.topic}`,
    "",
    `Run: ${new Date(report.startedAt).toISOString()} · ${report.scenarios.length} scenarios × ${report.repeats} repeats · ${Math.round(report.durationMs / 1000)}s`,
    "",
    `**Verdict:** ${report.verdict}`,
    "",
    `**Criteria compliance:** ${passed}/${measured} measured criteria met (${Math.round(compliance * 100)}%)`,
    "",
    "| Criterion | Method | Formula | Target | Measured | Status |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    (r) =>
      `| ${r.spec.label} | ${r.spec.method} | ${r.spec.formula} | ${r.spec.target} | ${r.display} | ${
        r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "not measured"
      } |`,
  );
  const scen = [
    "",
    "## Scenario results",
    "",
    "| Scenario | Score | Pass | Reliability | Consistency | Hallucination | Unmet gates |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.scenarios.map(
      (s) =>
        `| ${s.label} | ${Math.round(s.score * 100)}% | ${s.passed ? "PASS" : "FAIL"} | ${Math.round(
          s.reliability * 100,
        )}% | ${Math.round(s.consistency * 100)}% | ${Math.round(s.judge.hallucinationRate * 100)}% | ${
          s.failureReasons.join("; ") || "—"
        } |`,
    ),
  ];
  return [...head, ...body, ...scen, ""].join("\n");
}
