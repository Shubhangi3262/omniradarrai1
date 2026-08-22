import type { AgentRunResult } from "../agent/types";
import type { AutoMetrics, JudgeMetrics, ScenarioSpec, SingleRun } from "./types";

export const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const GENERIC_HINTS = [
  "verify against a primary source",
  "unknown",
  "n/a",
  "various sources",
  "the internet",
  "general knowledge",
];

export const EMPTY_AUTO: AutoMetrics = {
  taskCompletion: 0,
  evidenceQuality: 0,
  uncertaintyAwareness: 0,
  recovery: 0,
  resourceEfficiency: 0,
  latencyMs: 0,
  modelCalls: 0,
  toolFailures: 0,
  fallbacks: 0,
  degradedLanes: 0,
  replans: 0,
  conflictsResolved: 0,
};

export const EMPTY_JUDGE: JudgeMetrics = {
  accuracy: 0,
  groundedness: 0,
  hallucinationRate: 1,
  calibration: 0,
  refusalDiscipline: 0,
  actionability: 0,
  notes: "Run failed before it could be graded.",
  graded: false,
};

/** Structural + coverage completeness of the delivered briefing. */
function taskCompletionOf(r: AgentRunResult, spec: ScenarioSpec): number {
  const b = r.briefing;
  const checks = [
    Boolean(b?.headline?.trim()),
    (b?.summary?.trim().length ?? 0) > 80,
    (b?.signals?.length ?? 0) >= 3,
    (b?.opportunities?.length ?? 0) >= 1,
    (b?.risks?.length ?? 0) >= 1,
    (b?.recommended_actions?.length ?? 0) >= 2,
    (r.plan?.length ?? 0) >= 2,
  ];
  const structural = checks.filter(Boolean).length / checks.length;

  // lane coverage: did the requested focus areas actually produce evidence?
  const requested = spec.mutate("x").focus ?? [];
  const map: Record<string, string> = {
    publications: "research",
    patents: "patent",
    news: "news",
    competitors: "competitor",
    social: "social",
  };
  const wanted = new Set(requested.map((f) => map[f] ?? f));
  const delivered = new Set((b?.signals ?? []).map((s) => s.category as string));
  const coverage = wanted.size ? [...wanted].filter((w) => delivered.has(w)).length / wanted.size : 1;

  return clamp01(structural * 0.6 + coverage * 0.4);
}

/** Citation hygiene, confidence reporting and share of non-degraded evidence. */
function evidenceQualityOf(r: AgentRunResult): number {
  const signals = r.briefing?.signals ?? [];
  if (!signals.length) return 0;
  const hinted = signals.filter((s) => {
    const h = (s.source_hint ?? "").trim().toLowerCase();
    return h.length > 12 && !GENERIC_HINTS.some((g) => h === g);
  }).length;
  const scored = signals.filter((s) => typeof s.confidence === "number").length;
  const lanes = r.lanes ?? [];
  const solidLanes = lanes.length ? lanes.filter((l) => !l.degraded).length / lanes.length : 0.5;
  const distinct = new Set(signals.map((s) => s.title.trim().toLowerCase())).size / signals.length;
  return clamp01(
    (hinted / signals.length) * 0.4 + (scored / signals.length) * 0.2 + solidLanes * 0.2 + distinct * 0.2,
  );
}

/** Does the agent visibly know what it does not know? */
function uncertaintyAwarenessOf(r: AgentRunResult, spec: ScenarioSpec): number {
  const signals = r.briefing?.signals ?? [];
  const hedged = signals.filter((s) => typeof s.confidence === "number" && s.confidence < 0.85).length;
  const disputedFlagged = signals.some((s) => s.disputed);
  const gapsDeclared = (r.critique?.gaps?.length ?? 0) > 0;
  const unverified = (r.hypotheses ?? []).some((h) => h.verdict !== "supported");
  const notOverconfident = (r.critique?.confidence ?? 1) <= (spec.expectsHedging ? 0.9 : 1);

  const parts = [
    signals.length ? hedged / signals.length : 0,
    spec.id === "contradictory" ? (disputedFlagged ? 1 : 0) : disputedFlagged ? 1 : 0.6,
    gapsDeclared ? 1 : spec.expectsHedging ? 0 : 0.7,
    unverified ? 1 : 0.6,
    notOverconfident ? 1 : 0,
  ];
  return clamp01(mean(parts));
}

/** Recovered failures / injected failures — 1 when nothing broke. */
function recoveryOf(r: AgentRunResult): number {
  const failures = r.budget?.failures ?? 0;
  if (failures === 0) return 1;
  const completed = (r.briefing?.signals?.length ?? 0) >= 2 ? 1 : 0;
  const degraded = (r.lanes ?? []).filter((l) => l.degraded).length;
  const lanesAlive = (r.lanes ?? []).length ? 1 : 0;
  const recoveredSignals = clamp01(((r.lanes ?? []).length - degraded * 0.5) / Math.max(1, (r.lanes ?? []).length));
  const errorsInTrace = (r.trace ?? []).filter((t) => t.status === "error").length;
  const handled = errorsInTrace ? clamp01(1 - errorsInTrace / (failures + errorsInTrace)) : 1;
  return clamp01(completed * 0.4 + lanesAlive * 0.15 + recoveredSignals * 0.25 + handled * 0.2);
}

/** Useful work delivered per model call, relative to the budget granted. */
function resourceEfficiencyOf(r: AgentRunResult, completion: number): number {
  const used = Math.max(1, r.budget?.used ?? 1);
  const limit = Math.max(used, r.budget?.limit ?? used);
  const headroom = clamp01(1 - used / (limit * 1.15));
  const perCall = clamp01(completion / (used / 8)); // 8 calls treated as the efficient reference
  return clamp01(perCall * 0.65 + headroom * 0.35);
}

export function computeAuto(r: AgentRunResult, spec: ScenarioSpec, latencyMs: number): AutoMetrics {
  const taskCompletion = taskCompletionOf(r, spec);
  return {
    taskCompletion,
    evidenceQuality: evidenceQualityOf(r),
    uncertaintyAwareness: uncertaintyAwarenessOf(r, spec),
    recovery: recoveryOf(r),
    resourceEfficiency: resourceEfficiencyOf(r, taskCompletion),
    latencyMs,
    modelCalls: r.budget?.used ?? 0,
    toolFailures: r.budget?.failures ?? 0,
    fallbacks: r.budget?.fallbacks ?? 0,
    degradedLanes: (r.lanes ?? []).filter((l) => l.degraded).length,
    replans: r.critique?.replans ?? 0,
    conflictsResolved: (r.conflicts ?? []).length,
  };
}

/* ---------------- aggregation ---------------- */

export function averageAuto(list: AutoMetrics[]): AutoMetrics {
  if (!list.length) return { ...EMPTY_AUTO };
  const keys = Object.keys(EMPTY_AUTO) as (keyof AutoMetrics)[];
  const out = { ...EMPTY_AUTO };
  for (const k of keys) out[k] = mean(list.map((a) => a[k]));
  return out;
}

export function averageJudge(list: JudgeMetrics[]): JudgeMetrics {
  if (!list.length) return { ...EMPTY_JUDGE };
  return {
    accuracy: mean(list.map((j) => j.accuracy)),
    groundedness: mean(list.map((j) => j.groundedness)),
    hallucinationRate: mean(list.map((j) => j.hallucinationRate)),
    calibration: mean(list.map((j) => j.calibration)),
    refusalDiscipline: mean(list.map((j) => j.refusalDiscipline)),
    actionability: mean(list.map((j) => j.actionability)),
    notes: list.find((j) => j.notes)?.notes ?? "",
    graded: list.some((j) => j.graded),
  };
}

/** Jaccard agreement of signal titles + headline tokens across repeated runs. */
export function consistencyOf(runs: SingleRun[]): number {
  const ok = runs.filter((r) => r.ok);
  if (ok.length < 2) return ok.length === 1 ? 1 : 0;
  const bags = ok.map((r) =>
    new Set(
      [...r.signalTitles, r.headline]
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    ),
  );
  const pairs: number[] = [];
  for (let i = 0; i < bags.length; i++) {
    for (let j = i + 1; j < bags.length; j++) {
      const a = bags[i]!;
      const b = bags[j]!;
      const inter = [...a].filter((w) => b.has(w)).length;
      const union = new Set([...a, ...b]).size || 1;
      pairs.push(inter / union);
    }
  }
  // token-overlap of ~0.45 already means the same story told twice
  return clamp01(mean(pairs) / 0.45);
}

export function scoreOf(auto: AutoMetrics, judge: JudgeMetrics, weights: Record<string, number>): number {
  const values: Record<string, number> = {
    taskCompletion: auto.taskCompletion,
    accuracy: judge.accuracy,
    groundedness: judge.groundedness,
    evidenceQuality: auto.evidenceQuality,
    calibration: judge.calibration,
    refusalDiscipline: judge.refusalDiscipline,
    recovery: auto.recovery,
    resourceEfficiency: auto.resourceEfficiency,
  };
  let total = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    total += (values[k] ?? 0) * w;
    wsum += w;
  }
  const base = wsum ? total / wsum : 0;
  return clamp01(base * (1 - judge.hallucinationRate * 0.35));
}
