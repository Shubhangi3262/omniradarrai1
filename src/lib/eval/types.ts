import type { AgentRunResult } from "../agent/types";

export type ScenarioId =
  | "normal"
  | "ambiguous"
  | "adversarial"
  | "contradictory"
  | "incomplete"
  | "tool_failure";

export type ScenarioSpec = {
  id: ScenarioId;
  label: string;
  purpose: string;
  /** what a correct agent MUST do to pass this scenario */
  passCriteria: string[];
  chaos: { toolFailureRate: number; injectConflicts: boolean; budgetLimit: number };
  /** how the topic is mutated for this scenario */
  mutate: (topic: string) => { topic: string; competitors?: string; focus?: string[] };
  /** true when the expected behaviour is to hedge / declare gaps rather than assert */
  expectsHedging: boolean;
};

/** Deterministic, code-computed metrics — no model involved. */
export type AutoMetrics = {
  taskCompletion: number; // 0..1 structural + coverage completeness
  evidenceQuality: number; // 0..1 citation hygiene + non-degraded evidence
  uncertaintyAwareness: number; // 0..1 does it flag disputes, gaps, low confidence
  recovery: number; // 0..1 recovered failures / injected failures
  resourceEfficiency: number; // 0..1 completion per model call vs budget
  latencyMs: number;
  modelCalls: number;
  toolFailures: number;
  fallbacks: number;
  degradedLanes: number;
  replans: number;
  conflictsResolved: number;
};

/** Model-graded (LLM-as-judge) metrics. */
export type JudgeMetrics = {
  accuracy: number; // 0..1 factual/domain plausibility of claims
  groundedness: number; // 0..1 claims tied to a verifiable source hint
  hallucinationRate: number; // 0..1 share of unsupported / invented claims
  calibration: number; // 0..1 stated confidence matches evidence strength
  refusalDiscipline: number; // 0..1 declines unsupported conclusions when data is thin
  actionability: number; // 0..1 usefulness of recommendations
  notes: string;
  graded: boolean; // false when judge was unavailable (heuristic fallback used)
};

export type SingleRun = {
  index: number;
  ok: boolean;
  error?: string;
  auto: AutoMetrics;
  judge: JudgeMetrics;
  headline: string;
  signalTitles: string[];
  gaps: string[];
  selfConfidence: number;
  result?: AgentRunResult;
};

export type BaselineRun = {
  ok: boolean;
  error?: string;
  auto: AutoMetrics;
  judge: JudgeMetrics;
  headline: string;
};

export type ScenarioResult = {
  scenario: ScenarioId;
  label: string;
  purpose: string;
  passCriteria: string[];
  runs: SingleRun[];
  /** mean of every numeric metric across repeats */
  auto: AutoMetrics;
  judge: JudgeMetrics;
  reliability: number; // successful runs / attempted runs
  consistency: number; // 0..1 agreement of outputs across repeated runs
  score: number; // 0..1 weighted scenario score
  passed: boolean;
  failureReasons: string[];
};

export type EvaluationReport = {
  topic: string;
  startedAt: number;
  durationMs: number;
  repeats: number;
  scenarios: ScenarioResult[];
  baseline: BaselineRun | null;
  overall: {
    score: number;
    accuracy: number;
    groundedness: number;
    hallucinationRate: number;
    taskCompletion: number;
    reliability: number;
    robustness: number; // adversarial score / normal score
    consistency: number;
    recovery: number;
    evidenceQuality: number;
    calibration: number;
    refusalDiscipline: number;
    avgLatencyMs: number;
    avgModelCalls: number;
    resourceEfficiency: number;
    passRate: number;
  };
  uplift: {
    accuracy: number;
    groundedness: number;
    hallucinationRate: number;
    taskCompletion: number;
    evidenceQuality: number;
  } | null;
  verdict: string;
};
