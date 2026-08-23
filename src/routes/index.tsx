import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CircuitBoard,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  History,
  Lightbulb,
  Loader2,
  Newspaper,
  Radar,
  Rocket,
  Scale,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

import { runAgentGraph } from "@/lib/agent.functions";
import type { AgentRunResult } from "@/lib/agent/types";
import {
  buildMemoryContext,
  clearMemory,
  forgetEntry,
  loadMemory,
  rememberBriefing,
  type MemoryEntry,
} from "@/lib/memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SignalScope — LangGraph Multi-Agent Intelligence System" },
      {
        name: "description",
        content:
          "A LangGraph multi-agent system that plans dynamically, runs specialist lanes in parallel, resolves conflicting evidence and recovers from tool failure — with a live adversarial test harness.",
      },
      { property: "og:title", content: "SignalScope — LangGraph Multi-Agent Intelligence System" },
      {
        property: "og:description",
        content:
          "Dynamic planning, parallel agents, checkpointing, self-evaluation and autonomous replanning under adversarial conditions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SOURCES = [
  { id: "publications", label: "Publications", icon: FileText },
  { id: "patents", label: "Patents", icon: Scale },
  { id: "news", label: "Industry news", icon: Newspaper },
  { id: "competitors", label: "Competitor moves", icon: Users },
  { id: "social", label: "Social chatter", icon: Activity },
];

const CATEGORY_ICON = {
  research: FileText,
  patent: Scale,
  news: Newspaper,
  competitor: Users,
  social: Activity,
} as const;

const STATUS_STYLE = {
  ok: "text-primary",
  info: "text-muted-foreground",
  warn: "text-accent",
  error: "text-destructive",
} as const;

function Index() {
  const [topic, setTopic] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [focus, setFocus] = useState<string[]>(["publications", "patents", "news"]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [useMemory, setUseMemory] = useState(true);

  // adversarial harness
  const [failureRate, setFailureRate] = useState(0);
  const [injectConflicts, setInjectConflicts] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState(16);

  useEffect(() => {
    setMemory(loadMemory());
  }, []);

  const run = useServerFn(runAgentGraph);
  const mutation = useMutation<AgentRunResult, Error, void>({
    mutationFn: () =>
      run({
        data: {
          topic,
          competitors,
          focus,
          chaos: { toolFailureRate: failureRate, injectConflicts, budgetLimit },
          ...(useMemory ? { memory: buildMemoryContext(memory, topic) } : {}),
        },
      }),
    onSuccess: (data) => setMemory(rememberBriefing({ topic, competitors }, data.briefing)),
  });

  const toggle = (id: string) =>
    setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const result = mutation.data;
  const briefing = result?.briefing;
  const recall = buildMemoryContext(memory, topic);

  return (
    <main className="min-h-screen bg-background bg-hero-grid">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <header className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Radar className="size-3.5 text-primary" />
            LangGraph multi-agent system
          </div>
          <Link
            to="/evaluation"
            className="ml-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
          >
            <FlaskConical className="size-3.5" />
            Evaluation harness
          </Link>
          <Link
            to="/observability"
            className="ml-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
          >
            <FlaskConical className="size-3.5" />
            Tracing &amp; observability
          </Link>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-gradient-intel">SignalScope</span> plans, argues with
            itself, and recovers when its tools break.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            A stateful graph of specialist agents: it decomposes the objective, fans out in
            parallel, adjudicates contradictions, tests hypotheses, grades itself and
            replans autonomously — under a hard resource budget and live tool chaos.
          </p>
        </header>

        <Card className="mt-10 border-border bg-card/70 panel-shadow backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="size-5 text-primary" /> Monitoring brief
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="topic">Domain or technology to track</Label>
              <Input
                id="topic"
                placeholder="e.g. solid-state battery electrolytes"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="competitors">Competitors (optional, comma separated)</Label>
              <Input
                id="competitors"
                placeholder="e.g. QuantumScape, Toyota, CATL"
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Source priorities</Label>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((s) => {
                  const active = focus.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <s.icon className="size-3.5" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Agent memory</Label>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setUseMemory((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    useMemory
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Brain className="size-3.5" />
                  {useMemory ? "Memory on" : "Memory off"}
                </button>
                <span className="text-muted-foreground">
                  {recall.shortTerm.length} short-term · {recall.longTerm.length} long-term
                  recalled for this domain
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- adversarial harness ---------------- */}
        <Card className="mt-6 border-destructive/30 bg-card/70 panel-shadow backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="size-5 text-destructive" /> Adversarial live test
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <p className="text-sm text-muted-foreground">
              Break the agent on purpose. Tool calls fail at the rate you set, contradictory
              evidence is injected into the adjudicator, and the whole run is capped to a
              fixed number of model calls. The objective must still complete.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="grid gap-3">
                <Label>
                  Tool failure rate —{" "}
                  <span className="text-destructive">{Math.round(failureRate * 100)}%</span>
                </Label>
                <Slider
                  value={[failureRate * 100]}
                  onValueChange={([v]) => setFailureRate((v ?? 0) / 100)}
                  max={90}
                  step={10}
                />
              </div>
              <div className="grid gap-3">
                <Label>
                  Execution budget — <span className="text-primary">{budgetLimit} model calls</span>
                </Label>
                <Slider
                  value={[budgetLimit]}
                  onValueChange={([v]) => setBudgetLimit(v ?? 16)}
                  min={4}
                  max={30}
                  step={2}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInjectConflicts((v) => !v)}
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                injectConflicts
                  ? "border-destructive bg-destructive/15 text-destructive"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="size-3.5" />
              {injectConflicts ? "Conflicting evidence injected" : "Inject conflicting evidence"}
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={topic.trim().length < 2 || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Graph executing…
                  </>
                ) : (
                  <>
                    <Radar className="size-4" />{" "}
                    {recall.shortTerm.length ? "Run follow-up sweep" : "Run agent graph"}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={topic.trim().length < 2 || mutation.isPending}
                onClick={() => {
                  setFailureRate(0.6);
                  setInjectConflicts(true);
                  setBudgetLimit(10);
                  setTimeout(() => mutation.mutate(), 0);
                }}
              >
                <Zap className="size-4" /> Run chaos scenario
              </Button>
              {mutation.isError && <p className="text-sm text-destructive">{mutation.error.message}</p>}
            </div>
          </CardContent>
        </Card>

        {mutation.isPending && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* ---------------- run telemetry ---------------- */}
        {result && (
          <section className="mt-10 space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Self-confidence" value={`${Math.round(result.critique.confidence * 100)}%`} />
              <Stat label="Autonomous replans" value={String(result.critique.replans)} />
              <Stat
                label="Budget used"
                value={`${result.budget.used}/${result.budget.limit}`}
                hint={`${result.budget.failures} failures · ${result.budget.fallbacks} fallbacks`}
              />
              <Stat label="Conflicts resolved" value={String(result.conflicts.length)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GitBranch className="size-4 text-primary" /> Final plan &amp; parallel lanes
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {result.lanes.map((l, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{l.agent}</span>
                        <Badge variant={l.degraded ? "outline" : "secondary"} className="text-xs">
                          {l.tool} {l.degraded ? "· degraded" : ""}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{l.objective}</p>
                    </div>
                  ))}
                  {!result.lanes.length && (
                    <p className="text-sm text-muted-foreground">No lane reports recorded.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CircuitBoard className="size-4 text-primary" /> Execution trace
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-80 space-y-1 overflow-y-auto font-mono text-xs">
                    {result.trace.map((e, i) => (
                      <p key={i} className={STATUS_STYLE[e.status]}>
                        <span className="text-muted-foreground/70">[{e.node}]</span> {e.message}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {!!result.conflicts.length && (
              <Card className="border-destructive/30 bg-card/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-4 text-destructive" /> Conflicting evidence resolved
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {result.conflicts.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                      <p className="text-sm font-medium">{c.claim}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {c.sides.map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm">
                        <span className="text-primary">Resolution:</span> {c.resolution}{" "}
                        <span className="text-muted-foreground">
                          (confidence {Math.round(c.confidence * 100)}%)
                        </span>
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!!result.hypotheses.length && (
              <Card className="border-border bg-card/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="size-4 text-primary" /> Hypothesis verification
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {result.hypotheses.map((h, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{h.statement}</p>
                        <Badge
                          variant={h.verdict === "supported" ? "default" : "outline"}
                          className="shrink-0 capitalize"
                        >
                          {h.verdict}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{h.reasoning}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border-border bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" /> Self-evaluation
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p>{result.critique.verdict}</p>
                <p className="text-muted-foreground">
                  Coverage: {result.critique.coverage.join(", ") || "none"}
                </p>
                <p className="text-muted-foreground">
                  Remaining gaps: {result.critique.gaps.join("; ") || "none"}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Checkpoint thread: <span className="font-mono">{result.threadId}</span>
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        {!!memory.length && (
          <Card className="mt-8 border-border bg-card/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4 text-primary" /> Memory store ({memory.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMemory(clearMemory())}
                className="text-muted-foreground"
              >
                <Trash2 className="size-4" /> Clear all
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2">
              {memory.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
                >
                  <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(m.topic);
                      setCompetitors(m.competitors ?? "");
                    }}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium">{m.topic}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.ts).toLocaleString()} — {m.headline}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Forget entry"
                    onClick={() => setMemory(forgetEntry(m.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ---------------- briefing ---------------- */}
        {briefing && (
          <section className="mt-12 space-y-8">
            <Card className="border-primary/30 bg-card/70 panel-shadow">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-semibold tracking-tight">{briefing.headline}</h2>
                <p className="mt-3 text-muted-foreground">{briefing.summary}</p>
                {briefing.continuity && (
                  <p className="mt-4 flex gap-2 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-foreground">
                    <Brain className="mt-0.5 size-4 shrink-0 text-primary" />
                    {briefing.continuity}
                  </p>
                )}
              </CardContent>
            </Card>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Detected signals
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {briefing.signals?.map((s, i) => {
                  const Icon = CATEGORY_ICON[s.category] ?? Activity;
                  return (
                    <Card key={i} className="border-border bg-card/60">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
                            <Icon className="size-4" />
                            {s.category}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {s.disputed && (
                              <Badge variant="outline" className="gap-1 border-destructive text-destructive">
                                <AlertTriangle className="size-3" /> disputed
                              </Badge>
                            )}
                            {typeof s.confidence === "number" && (
                              <Badge variant="outline" className="text-xs">
                                c {Math.round(s.confidence * 100)}%
                              </Badge>
                            )}
                            <Badge
                              variant={s.impact === "high" ? "default" : "secondary"}
                              className="capitalize"
                            >
                              {s.impact} impact
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-3 font-medium">{s.title}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{s.insight}</p>
                        <p className="mt-3 text-xs text-muted-foreground/80">Verify via {s.source_hint}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {!!briefing.competitor_moves?.length && (
              <div>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Competitor moves
                </h3>
                <div className="grid gap-3">
                  {briefing.competitor_moves.map((c, i) => (
                    <Card key={i} className="border-border bg-card/60">
                      <CardContent className="flex flex-col gap-1 pt-5 sm:flex-row sm:items-start sm:gap-6">
                        <p className="min-w-40 font-medium">{c.name}</p>
                        <div>
                          <p className="text-sm">{c.move}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{c.implication}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <ListCard title="Opportunities" icon={Lightbulb} items={briefing.opportunities} />
              <ListCard title="Risks" icon={AlertTriangle} items={briefing.risks} />
              <ListCard title="Recommended actions" icon={Rocket} items={briefing.recommended_actions} />
            </div>
          </section>
        )}

        {/* ---------------- framework justification ---------------- */}
        <section className="mt-16">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Why LangGraph
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <ListCard
              title="Framework choice"
              icon={GitBranch}
              items={[
                "LangGraph models the agent as a stateful graph, so cycles (critic → planner) are first-class — CrewAI/AutoGen assume mostly linear or chat-driven flows.",
                "Send() gives true parallel fan-out with a typed reducer merging lane results into shared state.",
                "A checkpointer persists every super-step, so an aborted run resumes from its last good state instead of restarting.",
                "Conditional edges express routing as data, which is what makes autonomous replanning and loop-breaking auditable.",
              ]}
            />
            <ListCard
              title="Resilience mechanisms"
              icon={ShieldAlert}
              items={[
                "Tool fallback chain per lane: live sweep → degraded sweep → memory archive recall.",
                "Model fallback chain plus retry/backoff on every call; a dead lane degrades instead of killing the run.",
                "Adjudicator resolves contradictions by weighing support, never by averaging.",
                "Loop and deadlock detection: identical plan signatures and stalled progress scores break the cycle.",
                "Resource-aware execution: the plan shrinks and LLM stages are skipped as the call budget drains.",
              ]}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Lightbulb;
  items?: string[];
}) {
  if (!items?.length) return null;
  return (
    <Card className="border-border bg-card/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              {it}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
