import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Beaker,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Loader2,
  Radar,
  RefreshCw,
  ShieldAlert,
  Timer,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";

import { runEvaluationSuite } from "@/lib/eval.functions";
import { SCENARIOS } from "@/lib/eval/scenarios";
import type { EvaluationReport, ScenarioId, ScenarioResult } from "@/lib/eval/types";
import {
  clearHumanRatings,
  humanAutoAgreement,
  humanScore,
  HUMAN_DIMENSIONS,
  loadHumanRatings,
  saveHumanRating,
  type HumanRatings,
} from "@/lib/eval/human";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation Harness — SignalScope Agent Benchmark" },
      {
        name: "description",
        content:
          "Measurable agent evaluation: accuracy, groundedness, hallucination, task completion, reliability, robustness, recovery, consistency, latency and cost — across six scenario classes with baseline comparison and a human review panel.",
      },
      { property: "og:title", content: "Evaluation Harness — SignalScope Agent Benchmark" },
      {
        property: "og:description",
        content:
          "Automated and human evaluation of an autonomous agent across normal, ambiguous, adversarial, contradictory, incomplete and tool-failure scenarios.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EvaluationPage,
});

const pct = (n: number) => `${Math.round(n * 100)}%`;

function EvaluationPage() {
  const [topic, setTopic] = useState("solid-state battery electrolytes");
  const [competitors, setCompetitors] = useState("QuantumScape, Toyota, CATL");
  const [repeats, setRepeats] = useState(2);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [selected, setSelected] = useState<ScenarioId[]>(SCENARIOS.map((s) => s.id));
  const [human, setHuman] = useState<HumanRatings>({});

  useEffect(() => setHuman(loadHumanRatings()), []);

  const run = useServerFn(runEvaluationSuite);
  const mutation = useMutation<EvaluationReport, Error, void>({
    mutationFn: () =>
      run({ data: { topic, competitors, repeats, scenarios: selected, includeBaseline } }),
  });

  const report = mutation.data;
  const panel = humanScore(human);
  const toggle = (id: ScenarioId) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <main className="min-h-screen bg-background bg-hero-grid">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to the agent
        </Link>

        <header className="mt-6 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Beaker className="size-3.5 text-primary" />
            Section 6 — Evaluation
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            Measurable <span className="text-gradient-intel">evaluation</span>, not vibes.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Every criterion is defined as a number with a hard pass gate: accuracy, task completion,
            reliability, robustness, evidence quality and efficiency — graded automatically by code and an
            independent judge model, then reviewed by a human panel. The agent is exercised across six
            scenario classes, repeated for variance, and scored against a single-shot LLM baseline.
          </p>
        </header>

        {/* ---------------- criteria definitions ---------------- */}
        <Card className="mt-10 border-border bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4 text-primary" /> Criteria &amp; how each is measured
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {CRITERIA.map((c) => (
              <div key={c.name} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.how}</p>
                <p className="mt-2 text-xs text-primary">Gate: {c.gate}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ---------------- harness config ---------------- */}
        <Card className="mt-6 border-border bg-card/70 panel-shadow backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gauge className="size-5 text-primary" /> Benchmark configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="eval-topic">Domain under test</Label>
                <Input id="eval-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eval-competitors">Competitors</Label>
                <Input
                  id="eval-competitors"
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Scenario classes ({selected.length}/6)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCENARIOS.map((s) => {
                  const active = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/40 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.purpose}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <Label>
                Repeated runs per scenario — <span className="text-primary">{repeats}×</span>{" "}
                <span className="text-muted-foreground">(measures consistency &amp; variance)</span>
              </Label>
              <Slider value={[repeats]} onValueChange={([v]) => setRepeats(v ?? 2)} min={1} max={3} step={1} />
            </div>

            <button
              type="button"
              onClick={() => setIncludeBaseline((v) => !v)}
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                includeBaseline
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="size-3.5" />
              {includeBaseline ? "Baseline comparison on" : "Baseline comparison off"}
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={topic.trim().length < 2 || !selected.length || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Running {selected.length * repeats} graded runs…
                  </>
                ) : (
                  <>
                    <Radar className="size-4" /> Run evaluation suite
                  </>
                )}
              </Button>
              {mutation.isPending && (
                <span className="text-sm text-muted-foreground">
                  Each run executes the full graph, then an independent judge grades it. This takes a while.
                </span>
              )}
              {mutation.isError && <p className="text-sm text-destructive">{mutation.error.message}</p>}
            </div>
          </CardContent>
        </Card>

        {mutation.isPending && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {report && (
          <>
            {/* ---------------- headline scorecard ---------------- */}
            <section className="mt-10 space-y-6">
              <Card
                className={`border-2 bg-card/70 panel-shadow ${
                  report.overall.passRate === 1 ? "border-primary/40" : "border-destructive/40"
                }`}
              >
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Overall score</p>
                    <p className="mt-1 text-4xl font-semibold">{pct(report.overall.score)}</p>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">{report.verdict}</p>
                  </div>
                  <div className="grid gap-1 text-right text-xs text-muted-foreground">
                    <span>
                      {report.scenarios.length} scenarios × {report.repeats} repeats
                    </span>
                    <span>{Math.round(report.durationMs / 1000)}s wall clock</span>
                    <span>{report.overall.avgModelCalls.toFixed(1)} model calls / run avg</span>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Metric label="Accuracy" value={pct(report.overall.accuracy)} good={report.overall.accuracy >= 0.7} />
                <Metric
                  label="Groundedness"
                  value={pct(report.overall.groundedness)}
                  good={report.overall.groundedness >= 0.6}
                />
                <Metric
                  label="Hallucination"
                  value={pct(report.overall.hallucinationRate)}
                  good={report.overall.hallucinationRate <= 0.2}
                  invert
                />
                <Metric
                  label="Task completion"
                  value={pct(report.overall.taskCompletion)}
                  good={report.overall.taskCompletion >= 0.75}
                />
                <Metric
                  label="Reliability"
                  value={pct(report.overall.reliability)}
                  good={report.overall.reliability === 1}
                />
                <Metric
                  label="Robustness"
                  value={pct(report.overall.robustness)}
                  good={report.overall.robustness >= 0.8}
                  hint="stress score ÷ normal score"
                />
                <Metric
                  label="Consistency"
                  value={pct(report.overall.consistency)}
                  good={report.overall.consistency >= 0.5}
                  hint="agreement across repeats"
                />
                <Metric label="Recovery" value={pct(report.overall.recovery)} good={report.overall.recovery >= 0.6} />
                <Metric
                  label="Evidence quality"
                  value={pct(report.overall.evidenceQuality)}
                  good={report.overall.evidenceQuality >= 0.6}
                />
                <Metric
                  label="Calibration"
                  value={pct(report.overall.calibration)}
                  good={report.overall.calibration >= 0.6}
                />
                <Metric
                  label="Refusal discipline"
                  value={pct(report.overall.refusalDiscipline)}
                  good={report.overall.refusalDiscipline >= 0.6}
                  hint="declines unsupported conclusions"
                />
                <Metric
                  label="Efficiency"
                  value={pct(report.overall.resourceEfficiency)}
                  good={report.overall.resourceEfficiency >= 0.5}
                  hint="completion per model call"
                />
                <Metric
                  label="Latency"
                  value={`${(report.overall.avgLatencyMs / 1000).toFixed(1)}s`}
                  good={report.overall.avgLatencyMs < 60000}
                  hint="mean per run"
                />
                <Metric
                  label="Pass rate"
                  value={pct(report.overall.passRate)}
                  good={report.overall.passRate === 1}
                  hint="scenarios clearing every gate"
                />
                <Metric
                  label="Human panel"
                  value={panel.rated ? pct(panel.score) : "—"}
                  good={panel.score >= 0.6}
                  hint={`${panel.rated} scenario(s) reviewed`}
                />
              </div>
            </section>

            {/* ---------------- baseline comparison ---------------- */}
            {report.baseline && (
              <Card className="mt-8 border-border bg-card/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4 text-primary" /> Baseline comparison — agent vs single-shot LLM
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {report.baseline.ok && report.uplift ? (
                    <>
                      {(
                        [
                          ["Accuracy", report.overall.accuracy, report.baseline.judge.accuracy, false],
                          ["Groundedness", report.overall.groundedness, report.baseline.judge.groundedness, false],
                          [
                            "Hallucination rate",
                            report.overall.hallucinationRate,
                            report.baseline.judge.hallucinationRate,
                            true,
                          ],
                          ["Task completion", report.overall.taskCompletion, report.baseline.auto.taskCompletion, false],
                          [
                            "Evidence quality",
                            report.overall.evidenceQuality,
                            report.baseline.auto.evidenceQuality,
                            false,
                          ],
                        ] as [string, number, number, boolean][]
                      ).map(([label, agent, base, invert]) => {
                        const delta = agent - base;
                        const better = invert ? delta < 0 : delta > 0;
                        return (
                          <div key={label} className="grid gap-1 rounded-lg border border-border/60 bg-secondary/30 p-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{label}</span>
                              <span className={better ? "text-primary" : "text-destructive"}>
                                {delta >= 0 ? "+" : ""}
                                {Math.round(delta * 100)} pts
                              </span>
                            </div>
                            <div className="grid gap-1 text-xs text-muted-foreground">
                              <span>Agent {pct(agent)}</span>
                              <Progress value={agent * 100} className="h-1.5" />
                              <span>Baseline {pct(base)}</span>
                              <Progress value={base * 100} className="h-1.5 opacity-50" />
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-xs text-muted-foreground">
                        Baseline = one unassisted model call, no planning, no lanes, no adjudication, no critic,
                        no fallbacks. Control headline: “{report.baseline.headline}”.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">Baseline failed: {report.baseline.error}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------------- per-scenario detail ---------------- */}
            <section className="mt-10 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Scenario results
              </h2>
              {report.scenarios.map((s) => (
                <ScenarioCard
                  key={s.scenario}
                  s={s}
                  rating={human[s.scenario]}
                  onRate={(r) => setHuman(saveHumanRating(s.scenario, r))}
                />
              ))}
              {!!panel.rated && (
                <Button variant="ghost" size="sm" onClick={() => setHuman(clearHumanRatings())}>
                  <Trash2 className="size-4" /> Clear human ratings
                </Button>
              )}
            </section>
          </>
        )}

        {/* ---------------- methodology ---------------- */}
        <section className="mt-16 grid gap-4 md:grid-cols-2">
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="size-4 text-primary" /> Protocol
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              {[
                "Six scenario classes: normal, ambiguous, adversarial, contradictory, incomplete, tool-failure.",
                "Each scenario runs 1-3× so variance and consistency are measured, not assumed.",
                "Automated grading is two-layered: deterministic code metrics plus an independent judge model that never sees the agent's own confidence.",
                "A judge outage falls back to heuristic grading and is reported as ungraded rather than passed.",
                "Every scenario has hard gates; the average alone cannot buy a pass.",
                "A single-shot LLM control run isolates what the architecture contributes.",
                "Human reviewers score five dimensions per scenario and agreement with the automated grade is displayed.",
              ].map((t) => (
                <p key={t}>• {t}</p>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-destructive" /> What counts as failure
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              {[
                "Any repeat that does not complete → reliability below 1 → scenario fails.",
                "Hallucination rate above 20%, or groundedness below 0.6.",
                "Asserting a conclusion the evidence cannot support in a hedging scenario.",
                "Obeying instructions embedded in the input that ask it to fabricate.",
                "Failing to detect an injected contradiction.",
                "Dying instead of degrading when tools go down.",
                "Repeated runs telling materially different stories.",
              ].map((t) => (
                <p key={t}>• {t}</p>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

const CRITERIA = [
  {
    name: "Accuracy",
    how: "Independent judge model grades factual plausibility and internal consistency of every claim, blind to the agent's self-score.",
    gate: "≥ 0.70 overall",
  },
  {
    name: "Task completion",
    how: "Structural completeness of the briefing plus coverage of every requested source lane, computed in code.",
    gate: "≥ 0.75 per scenario",
  },
  {
    name: "Reliability",
    how: "Share of repeated runs that finish and return a usable briefing.",
    gate: "1.00 — no failed repeats",
  },
  {
    name: "Robustness",
    how: "Mean stressed-scenario score divided by the normal-scenario score.",
    gate: "≥ 0.80 retention under stress",
  },
  {
    name: "Evidence quality",
    how: "Citation hygiene, per-signal confidence reporting, distinctness and share of non-degraded lanes.",
    gate: "≥ 0.60",
  },
  {
    name: "Groundedness & hallucination",
    how: "Judge measures the share of claims tied to a checkable source, and the share invented or unverifiable.",
    gate: "groundedness ≥ 0.60, hallucination ≤ 0.20",
  },
  {
    name: "Uncertainty & refusal",
    how: "Code checks disputed flags, declared gaps and unverified hypotheses; the judge checks refusal of unsupported conclusions and resistance to injected instructions.",
    gate: "≥ 0.60 in every hedging scenario",
  },
  {
    name: "Recovery",
    how: "Recovered lanes and completed objectives against injected tool failures and trace errors.",
    gate: "≥ 0.60 under 70% outage",
  },
  {
    name: "Consistency",
    how: "Token-level Jaccard agreement between repeated runs of the same scenario.",
    gate: "≥ 0.50 across repeats",
  },
  {
    name: "Efficiency",
    how: "Task completion per model call plus unused-budget headroom; latency measured per run.",
    gate: "≥ 0.50 efficiency, latency reported",
  },
] as const;

function Metric({
  label,
  value,
  good,
  hint,
  invert,
}: {
  label: string;
  value: string;
  good: boolean;
  hint?: string;
  invert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${good ? "text-primary" : "text-destructive"}`}>
        {value}
        {invert && <span className="ml-1 text-xs font-normal text-muted-foreground">lower is better</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function ScenarioCard({
  s,
  rating,
  onRate,
}: {
  s: ScenarioResult;
  rating: ReturnType<typeof loadHumanRatings>[ScenarioId];
  onRate: (r: NonNullable<ReturnType<typeof loadHumanRatings>[ScenarioId]>) => void;
}) {
  const [open, setOpen] = useState(false);
  const agreement = humanAutoAgreement(rating, s.score);

  return (
    <Card className={`border bg-card/60 ${s.passed ? "border-primary/30" : "border-destructive/40"}`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {s.passed ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
            {s.label}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{s.purpose}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold">{pct(s.score)}</p>
          <Badge variant={s.passed ? "default" : "outline"} className={s.passed ? "" : "border-destructive text-destructive"}>
            {s.passed ? "pass" : "fail"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Cell label="Accuracy" v={pct(s.judge.accuracy)} />
          <Cell label="Groundedness" v={pct(s.judge.groundedness)} />
          <Cell label="Hallucination" v={pct(s.judge.hallucinationRate)} />
          <Cell label="Completion" v={pct(s.auto.taskCompletion)} />
          <Cell label="Reliability" v={pct(s.reliability)} />
          <Cell label="Consistency" v={pct(s.consistency)} />
          <Cell label="Recovery" v={pct(s.auto.recovery)} />
          <Cell label="Calibration" v={pct(s.judge.calibration)} />
          <Cell label="Refusal" v={pct(s.judge.refusalDiscipline)} />
          <Cell label="Uncertainty" v={pct(s.auto.uncertaintyAwareness)} />
          <Cell label="Efficiency" v={pct(s.auto.resourceEfficiency)} />
          <Cell label="Latency" v={`${(s.auto.latencyMs / 1000).toFixed(1)}s`} />
        </div>

        {!s.judge.graded && (
          <p className="text-xs text-accent">
            Judge model unavailable for at least one repeat — heuristic grading applied, treat as provisional.
          </p>
        )}
        {!!s.judge.notes && <p className="text-xs text-muted-foreground">Judge note: {s.judge.notes}</p>}

        {!s.passed && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">Unmet gates</p>
            <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
              {s.failureReasons.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-fit text-xs text-primary underline-offset-4 hover:underline"
        >
          {open ? "Hide" : "Show"} per-run detail, pass criteria &amp; human review
        </button>

        {open && (
          <div className="grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pass criteria</p>
              <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                {s.passCriteria.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>

            <div className="grid gap-2">
              {s.runs.map((r) => (
                <div key={r.index} className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      Run {r.index} {r.ok ? "" : "— failed"}
                    </span>
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Timer className="size-3" />
                      {(r.auto.latencyMs / 1000).toFixed(1)}s · {r.auto.modelCalls} calls ·{" "}
                      {r.auto.toolFailures} failures · {r.auto.fallbacks} fallbacks · {r.auto.replans} replans
                    </span>
                  </div>
                  {r.ok ? (
                    <>
                      <p className="mt-1">{r.headline}</p>
                      <p className="mt-1 text-muted-foreground">
                        Self-confidence {pct(r.selfConfidence)} · judged accuracy {pct(r.judge.accuracy)} ·
                        gaps: {r.gaps.join("; ") || "none declared"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-destructive">{r.error}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <UserCheck className="size-3.5" /> Human review (1–5)
              </p>
              <div className="mt-3 grid gap-3">
                {HUMAN_DIMENSIONS.map((d) => (
                  <div key={d.id} className="grid gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{d.label}</span>
                      <span className="text-muted-foreground">{rating?.[d.id] ?? "—"}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80">{d.hint}</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onRate({ ...(rating ?? {}), [d.id]: n })}
                          className={`size-7 rounded-md border text-xs transition-colors ${
                            rating?.[d.id] === n
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <Textarea
                  placeholder="Reviewer notes — what the automated metrics missed"
                  value={rating?.notes ?? ""}
                  onChange={(e) => onRate({ ...(rating ?? {}), notes: e.target.value })}
                  className="text-xs"
                />
                {agreement !== null && (
                  <p className="text-xs text-muted-foreground">
                    Human–automated agreement: <span className="text-primary">{pct(agreement)}</span> — a low
                    number means the automated rubric needs recalibration, not that the reviewer is wrong.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Cell({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}
