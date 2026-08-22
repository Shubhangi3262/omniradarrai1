import { Budget } from "../agent/llm.server";
import type { AgentRunResult } from "../agent/types";
import { runBaseline } from "./baseline.server";
import { judgeRun } from "./judge.server";
import {
  averageAuto,
  averageJudge,
  clamp01,
  computeAuto,
  consistencyOf,
  EMPTY_AUTO,
  EMPTY_JUDGE,
  mean,
  scoreOf,
} from "./metrics.server";
import { SCENARIOS, SCORE_WEIGHTS } from "./scenarios";
import type {
  BaselineRun,
  EvaluationReport,
  ScenarioId,
  ScenarioResult,
  ScenarioSpec,
  SingleRun,
} from "./types";

export type EvalInput = {
  topic: string;
  competitors: string;
  repeats: number;
  scenarios: ScenarioId[];
  includeBaseline: boolean;
};

/** Scenario passes only when every hard gate holds — not on the average alone. */
function gate(spec: ScenarioSpec, res: Omit<ScenarioResult, "passed" | "failureReasons">): string[] {
  const fail: string[] = [];
  if (res.reliability < 1) fail.push("At least one repeat failed to complete");
  if (res.auto.taskCompletion < 0.75) fail.push("Briefing incomplete or requested lanes uncovered");
  if (res.judge.hallucinationRate > 0.2) fail.push("Hallucination rate above the 20% threshold");
  if (res.judge.groundedness < 0.6) fail.push("Claims not tied to checkable sources");
  if (res.consistency < 0.5 && res.runs.filter((r) => r.ok).length > 1)
    fail.push("Repeated runs disagree with each other");
  if (spec.expectsHedging && res.auto.uncertaintyAwareness < 0.6)
    fail.push("Did not surface uncertainty where the scenario demands it");
  if (spec.expectsHedging && res.judge.refusalDiscipline < 0.6)
    fail.push("Asserted conclusions the evidence does not support");
  if (spec.id === "contradictory" && res.auto.conflictsResolved < 1)
    fail.push("Contradiction was not detected or adjudicated");
  if (spec.id === "tool_failure" && res.auto.recovery < 0.6) fail.push("Did not recover from tool outages");
  if (spec.id === "incomplete" && res.auto.resourceEfficiency < 0.4)
    fail.push("Burned the constrained budget without delivering");
  return fail;
}

export async function runEvaluation(input: EvalInput): Promise<EvaluationReport> {
  const { runIntelGraph } = await import("../agent/graph.server");
  const startedAt = Date.now();
  const specs = SCENARIOS.filter((s) => input.scenarios.includes(s.id));
  const judgeBudget = new Budget(specs.length * input.repeats + 6);

  const scenarios: ScenarioResult[] = [];

  for (const spec of specs) {
    const runs: SingleRun[] = [];
    for (let i = 0; i < input.repeats; i++) {
      const mutated = spec.mutate(input.topic);
      const t0 = Date.now();
      try {
        const result: AgentRunResult = await runIntelGraph({
          topic: mutated.topic,
          competitors: mutated.competitors ?? input.competitors,
          ...(mutated.focus ? { focus: mutated.focus } : {}),
          memoryDigest: "SHORT-TERM MEMORY: empty — evaluation runs start from a clean slate.",
          chaos: spec.chaos,
        });
        const latency = Date.now() - t0;
        const auto = computeAuto(result, spec, latency);
        const judge = await judgeRun(result, spec, judgeBudget);
        runs.push({
          index: i + 1,
          ok: true,
          auto,
          judge,
          headline: result.briefing?.headline ?? "",
          signalTitles: (result.briefing?.signals ?? []).map((s) => s.title),
          gaps: result.critique?.gaps ?? [],
          selfConfidence: result.critique?.confidence ?? 0,
          result,
        });
      } catch (e) {
        runs.push({
          index: i + 1,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          auto: { ...EMPTY_AUTO, latencyMs: Date.now() - t0 },
          judge: { ...EMPTY_JUDGE },
          headline: "",
          signalTitles: [],
          gaps: [],
          selfConfidence: 0,
        });
      }
    }

    const ok = runs.filter((r) => r.ok);
    const auto = averageAuto(ok.map((r) => r.auto));
    const judge = averageJudge(ok.map((r) => r.judge));
    const partial = {
      scenario: spec.id,
      label: spec.label,
      purpose: spec.purpose,
      passCriteria: spec.passCriteria,
      runs,
      auto,
      judge,
      reliability: runs.length ? ok.length / runs.length : 0,
      consistency: consistencyOf(runs),
      score: scoreOf(auto, judge, SCORE_WEIGHTS) * (runs.length ? ok.length / runs.length : 0),
    };
    const failureReasons = gate(spec, partial);
    scenarios.push({ ...partial, passed: failureReasons.length === 0, failureReasons });
  }

  /* ---------------- baseline control ---------------- */
  let baseline: BaselineRun | null = null;
  if (input.includeBaseline) {
    const normalSpec = SCENARIOS[0]!;
    const t0 = Date.now();
    try {
      const r = await runBaseline(input.topic, input.competitors);
      const auto = computeAuto(r, normalSpec, Date.now() - t0);
      const judge = await judgeRun(r, normalSpec, judgeBudget);
      baseline = { ok: true, auto, judge, headline: r.briefing.headline };
    } catch (e) {
      baseline = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        auto: { ...EMPTY_AUTO, latencyMs: Date.now() - t0 },
        judge: { ...EMPTY_JUDGE },
        headline: "",
      };
    }
  }

  /* ---------------- overall roll-up ---------------- */
  const normal = scenarios.find((s) => s.scenario === "normal");
  const stressed = scenarios.filter((s) =>
    (["adversarial", "contradictory", "incomplete", "tool_failure"] as ScenarioId[]).includes(s.scenario),
  );
  const robustness = normal && stressed.length && normal.score > 0
    ? clamp01(mean(stressed.map((s) => s.score)) / normal.score)
    : stressed.length
      ? clamp01(mean(stressed.map((s) => s.score)))
      : 0;

  const overall = {
    score: mean(scenarios.map((s) => s.score)),
    accuracy: mean(scenarios.map((s) => s.judge.accuracy)),
    groundedness: mean(scenarios.map((s) => s.judge.groundedness)),
    hallucinationRate: mean(scenarios.map((s) => s.judge.hallucinationRate)),
    taskCompletion: mean(scenarios.map((s) => s.auto.taskCompletion)),
    reliability: mean(scenarios.map((s) => s.reliability)),
    robustness,
    consistency: mean(scenarios.map((s) => s.consistency)),
    recovery: mean(scenarios.map((s) => s.auto.recovery)),
    evidenceQuality: mean(scenarios.map((s) => s.auto.evidenceQuality)),
    calibration: mean(scenarios.map((s) => s.judge.calibration)),
    refusalDiscipline: mean(scenarios.map((s) => s.judge.refusalDiscipline)),
    avgLatencyMs: mean(scenarios.map((s) => s.auto.latencyMs)),
    avgModelCalls: mean(scenarios.map((s) => s.auto.modelCalls)),
    resourceEfficiency: mean(scenarios.map((s) => s.auto.resourceEfficiency)),
    passRate: scenarios.length ? scenarios.filter((s) => s.passed).length / scenarios.length : 0,
  };

  const uplift =
    baseline && baseline.ok
      ? {
          accuracy: overall.accuracy - baseline.judge.accuracy,
          groundedness: overall.groundedness - baseline.judge.groundedness,
          hallucinationRate: overall.hallucinationRate - baseline.judge.hallucinationRate,
          taskCompletion: overall.taskCompletion - baseline.auto.taskCompletion,
          evidenceQuality: overall.evidenceQuality - baseline.auto.evidenceQuality,
        }
      : null;

  const failing = scenarios.filter((s) => !s.passed).map((s) => s.label);
  const verdict = failing.length
    ? `${scenarios.length - failing.length}/${scenarios.length} scenarios passed. Unmet gates in: ${failing.join(", ")}.`
    : `All ${scenarios.length} scenario classes passed every hard gate at ${input.repeats} repeat(s) each.`;

  return {
    topic: input.topic,
    startedAt,
    durationMs: Date.now() - startedAt,
    repeats: input.repeats,
    scenarios,
    baseline,
    overall,
    uplift,
    verdict,
  };
}
