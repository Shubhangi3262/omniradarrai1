import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Bug,
  Coins,
  Gauge,
  Loader2,
  Minus,
  Play,
  Stethoscope,
  Timer,
  Wrench,
} from "lucide-react";

import { SpanWaterfall } from "@/components/trace/SpanWaterfall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  getTraceDetail,
  listTraces,
  runObservabilityExperiment,
  type ExperimentResult,
} from "@/lib/trace.functions";
import type { FullTrace } from "@/lib/trace/types";

export const Route = createFileRoute("/observability")({
  head: () => ({
    meta: [
      { title: "Agent Observability — Traces, Diagnosis & A/B Remediation" },
      {
        name: "description",
        content:
          "End-to-end agent tracing: prompts, decisions, tool calls, latency, tokens, cost and errors. Inject a controlled failure, auto-diagnose the root cause and measure before-vs-after improvement.",
      },
      { property: "og:title", content: "Agent Observability — Traces, Diagnosis & A/B Remediation" },
      {
        property: "og:description",
        content:
          "Span waterfalls, automatic root-cause analysis and measurable before/after remediation for an autonomous research agent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ObservabilityPage,
});

const fmt = (n: number, unit: string) =>
  unit === "ms"
    ? n >= 1000
      ? `${(n / 1000).toFixed(1)}s`
      : `${Math.round(n)}ms`
    : unit === "usd"
      ? `$${n.toFixed(4)}`
      : unit === "%"
        ? `${Math.round(n)}%`
        : unit === "tok"
          ? n.toLocaleString()
          : String(n);

function ObservabilityPage() {
  const runExperiment = useServerFn(runObservabilityExperiment);
  const loadTraces = useServerFn(listTraces);
  const loadTrace = useServerFn(getTraceDetail);

  const [topic, setTopic] = useState("solid-state battery manufacturing");
  const [failureRate, setFailureRate] = useState(0.4);
  const [budget, setBudget] = useState(14);
  const [selected, setSelected] = useState<string | null>(null);

  const traces = useQuery({ queryKey: ["traces"], queryFn: () => loadTraces({}) });

  const detail = useQuery<FullTrace | null>({
    queryKey: ["trace", selected],
    enabled: !!selected,
    queryFn: () => loadTrace({ data: { traceId: selected! } }),
  });

  const experiment = useMutation<ExperimentResult>({
    mutationFn: () =>
      runExperiment({
        data: {
          topic,
          chaos: { toolFailureRate: failureRate, injectConflicts: true, budgetLimit: budget },
        },
      }),
    onSuccess: (r) => {
      setSelected(r.before.traceId);
      void traces.refetch();
    },
  });

  const exp = experiment.data;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to the agent
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Activity className="h-6 w-6 text-primary" /> Advanced tracing &amp; observability
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every run emits an OpenTelemetry-shaped trace: one span per graph node, model call, tool call and routing
          decision — with prompts, completions, token usage, cost, latency, retries, fallbacks and errors. Inject a
          controlled failure below, let the diagnoser read the trace, and compare the remediated run.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="h-4 w-4" /> Controlled failure experiment
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="topic">Monitoring domain</Label>
            <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Tool failure rate: {Math.round(failureRate * 100)}%</Label>
            <Slider
              className="mt-3"
              value={[failureRate * 100]}
              min={0}
              max={80}
              step={5}
              onValueChange={(v) => setFailureRate((v[0] ?? 0) / 100)}
            />
          </div>
          <div>
            <Label>Model-call budget: {budget}</Label>
            <Slider
              className="mt-3"
              value={[budget]}
              min={6}
              max={30}
              step={1}
              onValueChange={(v) => setBudget(v[0] ?? 14)}
            />
          </div>
          <div className="md:col-span-4">
            <Button onClick={() => experiment.mutate()} disabled={experiment.isPending}>
              {experiment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running before → diagnose → after…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Run experiment
                </>
              )}
            </Button>
            {experiment.isError ? (
              <p className="mt-2 text-sm text-destructive">{(experiment.error as Error).message}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {exp ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-4 w-4" /> Automatic root-cause diagnosis
                <Badge variant="outline">health {exp.diagnosis.healthScore}/100</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {exp.diagnosis.rootCauses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No faults detected in the baseline trace.</p>
              ) : (
                exp.diagnosis.rootCauses.map((c) => (
                  <div key={c.id} className="rounded-md border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={c.severity === "critical" ? "destructive" : "secondary"}>{c.severity}</Badge>
                      <p className="text-sm font-medium">{c.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{c.evidence}</p>
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">Fix applied: </span>
                      {c.fix}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      spans: {c.affectedSpans.slice(0, 6).join(", ") || "—"}
                    </p>
                  </div>
                ))
              )}
              {exp.diagnosis.changed.filter(Boolean).length ? (
                <div className="flex flex-wrap gap-1">
                  {exp.diagnosis.changed.filter(Boolean).map((c) => (
                    <Badge key={c} variant="outline" className="font-mono text-[10px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {exp.diagnosis.rationale.map((r, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  • {r}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" /> Before vs after
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{exp.verdict}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {exp.comparison.map((c) => {
                  const Icon = c.delta === 0 ? Minus : c.improved ? ArrowDownRight : ArrowUpRight;
                  return (
                    <div
                      key={c.metric}
                      className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="flex items-center gap-2 font-mono text-xs">
                        <span>{fmt(c.before, c.unit)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span>{fmt(c.after, c.unit)}</span>
                        <Badge
                          variant="outline"
                          className={
                            c.delta === 0
                              ? "text-muted-foreground"
                              : c.improved
                                ? "border-primary/50 text-primary"
                                : "border-destructive/50 text-destructive"
                          }
                        >
                          <Icon className="mr-1 h-3 w-3" />
                          {c.deltaPct > 0 ? "+" : ""}
                          {c.deltaPct.toFixed(0)}%
                        </Badge>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(exp.before.traceId)}>
                  Inspect before trace
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelected(exp.after.traceId)}>
                  Inspect after trace
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent traces</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {traces.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {(traces.data ?? []).map((t) => (
            <button
              key={t.trace_id}
              type="button"
              onClick={() => setSelected(t.trace_id)}
              className={`flex w-full flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-left text-xs ${
                selected === t.trace_id ? "border-primary/60 bg-primary/5" : "border-border/60"
              }`}
            >
              <Badge variant={t.success ? "secondary" : "destructive"}>{t.variant}</Badge>
              <span className="flex-1 truncate">{t.topic}</span>
              <span className="flex items-center gap-1 font-mono text-muted-foreground">
                <Timer className="h-3 w-3" />
                {fmt(t.duration_ms, "ms")}
              </span>
              <span className="flex items-center gap-1 font-mono text-muted-foreground">
                <Wrench className="h-3 w-3" />
                {t.tool_calls}/{t.tool_failures}
              </span>
              <span className="flex items-center gap-1 font-mono text-muted-foreground">
                <Coins className="h-3 w-3" />
                {t.total_tokens.toLocaleString()} tok
              </span>
              <span className="font-mono text-muted-foreground">score {t.task_score}</span>
            </button>
          ))}
          {!traces.isLoading && !(traces.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">No traces yet — run the experiment above.</p>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Span waterfall <span className="font-mono text-xs text-muted-foreground">{selected}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detail.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading spans…</p>
            ) : detail.data ? (
              <SpanWaterfall spans={detail.data.spans} />
            ) : (
              <p className="text-sm text-muted-foreground">Trace not found.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
