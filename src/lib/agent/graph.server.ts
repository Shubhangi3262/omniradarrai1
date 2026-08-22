import { Annotation, END, MemorySaver, Send, START, StateGraph } from "@langchain/langgraph";

import { Budget, BudgetExhausted, callModel, parseJson } from "./llm.server";
import { runRetrievalTool } from "./tools.server";
import type {
  AgentRunResult,
  ChaosConfig,
  Conflict,
  Hypothesis,
  IntelBriefing,
  LaneReport,
  PlanTask,
  SignalCategory,
  TraceEvent,
} from "./types";

type Evidence = {
  taskId: string;
  agent: SignalCategory;
  title: string;
  insight: string;
  impact: "high" | "medium" | "low";
  source_hint: string;
  confidence: number;
  tool?: string;
  degraded?: boolean;
};

const CATEGORIES: SignalCategory[] = ["research", "patent", "news", "competitor", "social"];

const StateAnn = Annotation.Root({
  topic: Annotation<string>(),
  competitors: Annotation<string>(),
  focus: Annotation<string[]>(),
  memoryDigest: Annotation<string>(),
  plan: Annotation<PlanTask[]>({ reducer: (_a, b) => b, default: () => [] }),
  currentTask: Annotation<PlanTask | null>({ reducer: (_a, b) => b, default: () => null }),
  evidence: Annotation<Evidence[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  lanes: Annotation<LaneReport[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  conflicts: Annotation<Conflict[]>({ reducer: (_a, b) => b, default: () => [] }),
  hypotheses: Annotation<Hypothesis[]>({ reducer: (_a, b) => b, default: () => [] }),
  critique: Annotation<AgentRunResult["critique"]>({
    reducer: (_a, b) => b,
    default: () => ({ confidence: 0, coverage: [], gaps: [], verdict: "", replans: 0 }),
  }),
  replans: Annotation<number>({ reducer: (a, b) => Math.max(a, b), default: () => 0 }),
  signatures: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  progress: Annotation<number[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  briefing: Annotation<IntelBriefing | null>({ reducer: (_a, b) => b, default: () => null }),
});

type State = typeof StateAnn.State;

export type RunInput = {
  topic: string;
  competitors?: string;
  focus?: string[];
  memoryDigest: string;
  chaos: ChaosConfig;
  threadId?: string;
};

/** Checkpointing: state is persisted per thread, so a crashed run can be resumed. */
const checkpointer = new MemorySaver();

export async function runIntelGraph(input: RunInput): Promise<AgentRunResult> {
  const budget = new Budget(Math.max(4, input.chaos.budgetLimit));
  const trace: TraceEvent[] = [];
  const log = (e: Omit<TraceEvent, "t">) => {
    trace.push({ ...e, t: Date.now() });
  };
  const chaosFailureRate = input.chaos.toolFailureRate;

  /* ---------------- nodes ---------------- */

  // 1. Dynamic planner — adaptive task decomposition, replans from critic feedback.
  const planner = async (s: State): Promise<Partial<State>> => {
    const replanning = s.replans > 0;
    log({
      node: "planner",
      status: "info",
      message: replanning
        ? `Replanning (round ${s.replans + 1}) to close gaps: ${s.critique.gaps.join("; ") || "unspecified"}`
        : "Decomposing objective into specialist tasks",
    });

    // resource-aware decomposition: fewer lanes when the budget is strained
    const wanted = budget.strained ? 2 : budget.remaining < 8 ? 3 : 5;
    let plan: PlanTask[] = [];
    try {
      const raw = await callModel({
        node: "planner",
        budget,
        trace: log,
        chaosFailureRate,
        json: true,
        system:
          'You are the PLANNER of a multi-agent intelligence system. Decompose the objective into independent specialist tasks. Return JSON {"tasks":[{"id":string,"agent":"research|patent|news|competitor|social","objective":string,"priority":"high|medium|low"}]}. Each objective is one sentence and must be verifiable.',
        user: [
          `Objective: monitor "${s.topic}".`,
          s.competitors ? `Competitors: ${s.competitors}` : "",
          s.focus.length ? `Preferred sources: ${s.focus.join(", ")}` : "",
          s.memoryDigest,
          replanning
            ? `PREVIOUS ROUND WAS INSUFFICIENT. Unresolved gaps: ${s.critique.gaps.join("; ")}. Plan ONLY tasks that close these gaps, and phrase them differently from before.`
            : "",
          `Resource constraint: at most ${wanted} tasks (execution budget is ${budget.remaining} model calls).`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      plan = (parseJson<{ tasks: PlanTask[] }>(raw)?.tasks ?? []).slice(0, wanted);
    } catch (e) {
      log({
        node: "planner",
        status: "error",
        message: `Planner degraded to heuristic plan: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    if (!plan.length) {
      // failure recovery: deterministic fallback plan
      const cats = (s.focus.length ? s.focus : CATEGORIES)
        .map((f) => (f === "publications" ? "research" : f === "competitors" ? "competitor" : f))
        .filter((f): f is SignalCategory => CATEGORIES.includes(f as SignalCategory))
        .slice(0, wanted);
      plan = (cats.length ? cats : CATEGORIES.slice(0, 3)).map((agent, i) => ({
        id: `fb-${s.replans}-${i}`,
        agent,
        objective: `Find the most consequential recent ${agent} developments in ${s.topic}.`,
        priority: "high" as const,
      }));
      log({ node: "planner", status: "warn", message: `Heuristic fallback plan with ${plan.length} tasks` });
    }

    plan = plan.map((t, i) => ({ ...t, id: t.id || `t-${s.replans}-${i}` }));
    log({ node: "planner", status: "ok", message: `Plan: ${plan.map((t) => t.agent).join(", ")}` });
    return { plan, signatures: [planSignature(plan)] };
  };

  // 2. Conditional routing → parallel fan-out, one branch per specialist.
  const dispatch = (s: State) => s.plan.map((task) => new Send("specialist", { ...s, currentTask: task }));

  // 3. Specialist agent — parallel lane backed by the tool registry with fallbacks.
  const specialist = async (s: State): Promise<Partial<State>> => {
    const task = s.currentTask!;
    const node = `agent:${task.agent}`;
    try {
      const result = await runRetrievalTool({
        agent: task.agent,
        objective: task.objective,
        topic: s.topic,
        competitors: s.competitors,
        memoryDigest: s.memoryDigest,
        budget,
        trace: log,
        chaosFailureRate,
      });
      const evidence: Evidence[] = result.findings.map((f) => ({
        ...f,
        taskId: task.id,
        agent: task.agent,
        tool: result.tool,
        ...(result.degraded ? { degraded: true } : {}),
      }));
      log({
        node,
        status: result.degraded ? "warn" : "ok",
        message: `${evidence.length} findings via ${result.tool} for "${task.objective.slice(0, 56)}"`,
      });
      return {
        evidence,
        lanes: [
          {
            agent: task.agent,
            objective: task.objective,
            tool: result.tool,
            degraded: result.degraded,
            findings: evidence.length,
          },
        ],
      };
    } catch (e) {
      // failure recovery: the branch degrades instead of killing the run
      log({
        node,
        status: "error",
        message: `Lane failed (${e instanceof Error ? e.message : String(e)}) — marked as gap, run continues`,
      });
      return {
        evidence: [
          {
            taskId: task.id,
            agent: task.agent,
            title: `Unverified: ${task.agent} sweep incomplete`,
            insight: `Every tool in the ${task.agent} chain failed under the current conditions. This lane is unresolved and excluded from high-confidence conclusions.`,
            impact: "low",
            source_hint: "re-run this lane when the source is reachable",
            confidence: 0.1,
            tool: "none",
            degraded: true,
          },
        ],
        lanes: [
          { agent: task.agent, objective: task.objective, tool: "none", degraded: true, findings: 0 },
        ],
      };
    }
  };

  // 4. Conflicting-evidence resolution + uncertainty-aware adjudication.
  const reconcile = async (s: State): Promise<Partial<State>> => {
    let evidence = s.evidence;
    if (input.chaos.injectConflicts) {
      const target = evidence.find((e) => !e.degraded);
      if (target) {
        evidence = [
          ...evidence,
          {
            ...target,
            taskId: `${target.taskId}-adv`,
            title: `Contradiction: ${target.title}`,
            insight: `A conflicting source asserts the opposite of: "${target.insight}" — claiming the effect is unproven and the timeline overstated.`,
            confidence: 0.55,
          },
        ];
        log({ node: "reconcile", status: "warn", message: "Adversarial contradictory evidence injected" });
      }
    }

    if (budget.remaining <= 1) {
      log({ node: "reconcile", status: "warn", message: "Low budget — heuristic reconciliation only" });
      return { conflicts: heuristicConflicts(evidence) };
    }

    try {
      const raw = await callModel({
        node: "reconcile",
        budget,
        trace: log,
        json: true,
        system:
          'You are the ADJUDICATOR. Find claims where the evidence conflicts, weigh them by plausibility and stated confidence, and resolve each. Return JSON {"conflicts":[{"claim":string,"sides":[string],"resolution":string,"confidence":number}]}. If nothing conflicts return an empty array. Never resolve by averaging: pick the better-supported side and say why.',
        user: evidence.map((e, i) => `${i + 1}. [${e.agent} c=${e.confidence}] ${e.title} — ${e.insight}`).join("\n"),
      });
      const conflicts = (parseJson<{ conflicts: Conflict[] }>(raw)?.conflicts ?? []).map((c) => ({
        ...c,
        confidence: clamp(Number(c.confidence) || 0.5),
      }));
      log({
        node: "reconcile",
        status: conflicts.length ? "warn" : "ok",
        message: conflicts.length ? `${conflicts.length} conflict(s) adjudicated` : "No contradictions detected",
      });
      return { conflicts };
    } catch {
      log({ node: "reconcile", status: "error", message: "Adjudicator unavailable — heuristic fallback" });
      return { conflicts: heuristicConflicts(evidence) };
    }
  };

  // 5. Hypothesis verification — state a falsifiable claim per lane and test it.
  const verify = async (s: State): Promise<Partial<State>> => {
    const solid = s.evidence.filter((e) => !e.degraded);
    if (!solid.length) {
      log({ node: "verifier", status: "warn", message: "No verifiable evidence — skipping hypothesis testing" });
      return { hypotheses: [] };
    }
    if (budget.remaining <= 2) {
      log({ node: "verifier", status: "warn", message: "Budget-constrained — heuristic hypothesis check" });
      return { hypotheses: heuristicHypotheses(solid, s.conflicts) };
    }
    try {
      const raw = await callModel({
        node: "verifier",
        budget,
        trace: log,
        json: true,
        system:
          'You are the VERIFIER. From the evidence, state 2-3 falsifiable hypotheses about where this domain is heading, then test each ONLY against the supplied evidence. Return JSON {"hypotheses":[{"statement":string,"verdict":"supported|refuted|unverified","reasoning":string,"confidence":number}]}. Mark "unverified" whenever the evidence is thin, degraded or disputed — do not reward guessing.',
        user: [
          `Domain: ${s.topic}`,
          `Adjudicated conflicts: ${s.conflicts.map((c) => `${c.claim} → ${c.resolution}`).join(" | ") || "none"}`,
          "Evidence:",
          ...s.evidence.map((e) => `- [${e.agent} c=${e.confidence}${e.degraded ? " DEGRADED" : ""}] ${e.title}: ${e.insight}`),
        ].join("\n"),
      });
      const hyps = (parseJson<{ hypotheses: Hypothesis[] }>(raw)?.hypotheses ?? []).map((h) => ({
        statement: h.statement,
        verdict: (["supported", "refuted", "unverified"].includes(h.verdict) ? h.verdict : "unverified") as Hypothesis["verdict"],
        reasoning: h.reasoning ?? "",
        confidence: clamp(Number(h.confidence) || 0.4),
      }));
      if (!hyps.length) throw new Error("no hypotheses");
      log({
        node: "verifier",
        status: hyps.some((h) => h.verdict === "unverified") ? "warn" : "ok",
        message: `${hyps.filter((h) => h.verdict === "supported").length}/${hyps.length} hypotheses supported`,
      });
      return { hypotheses: hyps };
    } catch {
      log({ node: "verifier", status: "error", message: "Verifier unavailable — heuristic hypothesis check" });
      return { hypotheses: heuristicHypotheses(solid, s.conflicts) };
    }
  };

  // 6. Self-evaluation.
  const critic = async (s: State): Promise<Partial<State>> => {
    const solid = s.evidence.filter((e) => !e.degraded);
    const failedLanes = [...new Set(s.evidence.filter((e) => e.degraded).map((e) => e.agent))];
    const gapsFromFailures = failedLanes.map((a) => `${a} lane unresolved (tool degraded)`);
    const unverified = s.hypotheses.filter((h) => h.verdict === "unverified").map((h) => `unverified: ${h.statement}`);

    let critique: AgentRunResult["critique"] = {
      confidence: clamp(solid.length ? avg(solid.map((e) => e.confidence)) : 0.2),
      coverage: [...new Set(solid.map((e) => e.agent))],
      gaps: [...gapsFromFailures, ...unverified],
      verdict: "Heuristic self-evaluation.",
      replans: s.replans,
    };

    if (budget.remaining > 2) {
      try {
        const raw = await callModel({
          node: "critic",
          budget,
          trace: log,
          json: true,
          system:
            'You are the CRITIC. Verify whether the evidence actually answers the objective. Be strict about unverified or thin claims. Return JSON {"confidence":number,"coverage":[string],"gaps":[string],"verdict":string}. gaps = concrete missing angles that another sweep could close (empty if the objective is met).',
          user: [
            `Objective: monitor "${s.topic}".`,
            `Resolved conflicts: ${s.conflicts.map((c) => c.claim).join("; ") || "none"}`,
            `Hypothesis tests: ${s.hypotheses.map((h) => `${h.statement} [${h.verdict}]`).join(" | ") || "none"}`,
            "Evidence:",
            ...s.evidence.map(
              (e) => `- [${e.agent} c=${e.confidence}${e.degraded ? " DEGRADED" : ""}] ${e.title}: ${e.insight}`,
            ),
          ].join("\n"),
        });
        const j = parseJson<AgentRunResult["critique"]>(raw);
        if (j)
          critique = {
            confidence: clamp(Number(j.confidence) || critique.confidence),
            coverage: j.coverage ?? critique.coverage,
            gaps: [...new Set([...(j.gaps ?? []), ...gapsFromFailures, ...unverified])],
            verdict: j.verdict ?? "",
            replans: s.replans,
          };
      } catch {
        log({ node: "critic", status: "warn", message: "Critic unavailable — heuristic self-evaluation kept" });
      }
    } else {
      log({ node: "critic", status: "warn", message: "Budget-constrained: skipping LLM self-evaluation" });
    }

    log({
      node: "critic",
      status: critique.confidence < 0.6 ? "warn" : "ok",
      message: `Confidence ${(critique.confidence * 100).toFixed(0)}% · gaps: ${critique.gaps.join("; ") || "none"}`,
    });
    return { critique, progress: [progressScore(s.evidence, critique.confidence)] };
  };

  // 7. Autonomous replan decision with loop / deadlock detection.
  const route = (s: State): "planner" | "synthesize" => {
    const needsMore = s.critique.confidence < 0.62 || s.critique.gaps.length > 0;
    if (!needsMore) return "synthesize";
    if (s.replans >= 2) {
      log({ node: "router", status: "warn", message: "Replan cap reached — proceeding with caveats" });
      return "synthesize";
    }
    if (budget.remaining <= 3) {
      log({ node: "router", status: "warn", message: "Insufficient budget to replan — proceeding with caveats" });
      return "synthesize";
    }
    const sig = planSignature(s.plan);
    if (s.signatures.filter((x) => x === sig).length > 1) {
      log({ node: "router", status: "error", message: "Loop detected: identical plan repeated — breaking cycle" });
      return "synthesize";
    }
    // deadlock detection: two consecutive rounds with no measurable progress
    const p = s.progress;
    if (p.length >= 2 && p[p.length - 1]! <= p[p.length - 2]! + 0.02) {
      log({
        node: "router",
        status: "error",
        message: "Deadlock detected: replanning is no longer improving the answer — breaking out",
      });
      return "synthesize";
    }
    log({ node: "router", status: "info", message: "Objective not met — autonomous replan" });
    return "planner";
  };

  const bumpReplan = async (s: State): Promise<Partial<State>> => ({ replans: s.replans + 1 });

  // 8. Synthesis into the decision-ready briefing.
  const synthesize = async (s: State): Promise<Partial<State>> => {
    const fallback = heuristicBriefing(s);
    if (budget.remaining <= 0) {
      log({ node: "synthesize", status: "warn", message: "Budget exhausted — deterministic synthesis" });
      return { briefing: fallback };
    }
    try {
      const raw = await callModel({
        node: "synthesize",
        budget,
        trace: log,
        json: true,
        system:
          'You are the SYNTHESISER. Turn adjudicated evidence into one decision-ready briefing. Flag disputed and low-confidence items honestly; state uncertainty in the summary rather than hiding it. Return ONLY JSON {"headline":string,"summary":string,"continuity":string,"signals":[{"category":"research|patent|news|competitor|social","title":string,"insight":string,"impact":"high|medium|low","source_hint":string,"is_new":boolean,"confidence":number,"disputed":boolean}],"competitor_moves":[{"name":string,"move":string,"implication":string}],"opportunities":[string],"risks":[string],"recommended_actions":[string]}. 3-5 competitor moves, 3-4 items per list.',
        user: [
          `Domain: ${s.topic}`,
          s.competitors ? `Competitors: ${s.competitors}` : "",
          s.memoryDigest,
          `Self-evaluation: confidence ${(s.critique.confidence * 100).toFixed(0)}%, gaps: ${s.critique.gaps.join("; ") || "none"}. ${s.critique.verdict}`,
          `Hypothesis tests: ${s.hypotheses.map((h) => `${h.statement} → ${h.verdict}`).join(" | ") || "none"}`,
          `Resolved conflicts: ${s.conflicts.map((c) => `${c.claim} → ${c.resolution}`).join(" | ") || "none"}`,
          "Evidence:",
          ...s.evidence.map(
            (e) =>
              `- [${e.agent} c=${e.confidence}${e.degraded ? " DEGRADED/UNVERIFIED" : ""}] ${e.title}: ${e.insight} (verify: ${e.source_hint})`,
          ),
        ]
          .filter(Boolean)
          .join("\n"),
      });
      const j = parseJson<IntelBriefing>(raw);
      if (!j?.headline) throw new Error("unparsable");
      log({ node: "synthesize", status: "ok", message: "Briefing assembled" });
      return { briefing: { ...fallback, ...j } };
    } catch {
      log({ node: "synthesize", status: "error", message: "Synthesiser failed — deterministic briefing from evidence" });
      return { briefing: fallback };
    }
  };

  /* ---------------- graph ---------------- */

  const graph = new StateGraph(StateAnn)
    .addNode("planner", planner)
    .addNode("specialist", specialist)
    .addNode("reconcile", reconcile)
    .addNode("verify", verify)
    .addNode("critic", critic)
    .addNode("bumpReplan", bumpReplan)
    .addNode("synthesize", synthesize)
    .addEdge(START, "planner")
    .addConditionalEdges("planner", dispatch, ["specialist"])
    .addEdge("specialist", "reconcile")
    .addEdge("reconcile", "verify")
    .addEdge("verify", "critic")
    .addConditionalEdges("critic", route, { planner: "bumpReplan", synthesize: "synthesize" })
    .addEdge("bumpReplan", "planner")
    .addEdge("synthesize", END)
    .compile({ checkpointer });

  const threadId = input.threadId ?? `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let final: State;
  try {
    final = (await graph.invoke(
      {
        topic: input.topic,
        competitors: input.competitors ?? "",
        focus: input.focus ?? [],
        memoryDigest: input.memoryDigest,
      },
      { configurable: { thread_id: threadId }, recursionLimit: 40 },
    )) as State;
  } catch (e) {
    if (e instanceof BudgetExhausted) throw new Error("The agent ran out of its execution budget before finishing.");
    // last-resort recovery: rebuild the answer from the last checkpoint
    const snap = await graph.getState({ configurable: { thread_id: threadId } });
    const partial = snap.values as State | undefined;
    if (!partial?.evidence?.length) throw e;
    log({ node: "recovery", status: "error", message: "Graph aborted — resumed briefing from last checkpoint" });
    final = { ...partial, briefing: heuristicBriefing(partial) };
  }

  return {
    briefing: final.briefing ?? heuristicBriefing(final),
    plan: final.plan,
    trace,
    conflicts: final.conflicts,
    hypotheses: final.hypotheses ?? [],
    lanes: final.lanes ?? [],
    critique: final.critique,
    budget: { limit: budget.limit, used: budget.used, failures: budget.failures, fallbacks: budget.fallbacks },
    threadId,
  };
}

/* ---------------- helpers ---------------- */

function clamp(n: number) {
  return Math.max(0, Math.min(1, n));
}
function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}
function planSignature(plan: PlanTask[]) {
  return plan
    .map((t) => `${t.agent}:${t.objective.slice(0, 40).toLowerCase()}`)
    .sort()
    .join("|");
}
function progressScore(evidence: Evidence[], confidence: number) {
  const solid = evidence.filter((e) => !e.degraded).length;
  return confidence * 0.7 + Math.min(1, solid / 8) * 0.3;
}

function heuristicHypotheses(evidence: Evidence[], conflicts: Conflict[]): Hypothesis[] {
  const top = [...evidence].sort((a, b) => b.confidence - a.confidence).slice(0, 2);
  return top.map((e) => {
    const disputed = conflicts.some((c) => c.claim.toLowerCase().includes(e.title.slice(0, 24).toLowerCase()));
    return {
      statement: `${e.title} is a durable trend in this domain.`,
      verdict: disputed ? "unverified" : e.confidence >= 0.7 ? "supported" : "unverified",
      reasoning: disputed
        ? "A contradicting source is unresolved, so the claim cannot be treated as verified."
        : `Backed only by the ${e.agent} lane at confidence ${e.confidence.toFixed(2)}; corroboration from a second lane is missing.`,
      confidence: disputed ? 0.3 : clamp(e.confidence * 0.8),
    };
  });
}

function heuristicConflicts(evidence: Evidence[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const e of evidence) {
    if (!e.title.toLowerCase().startsWith("contradiction:")) continue;
    const original = evidence.find((o) => `Contradiction: ${o.title}` === e.title);
    conflicts.push({
      claim: original?.title ?? e.title,
      sides: [original?.insight ?? "original claim", e.insight],
      resolution: `Unresolved without the adjudicator: the higher-confidence side (${Math.max(e.confidence, original?.confidence ?? 0)}) is carried forward and flagged as disputed.`,
      confidence: 0.4,
    });
  }
  return conflicts;
}

function heuristicBriefing(s: State): IntelBriefing {
  const solid = s.evidence.filter((e) => !e.degraded);
  return {
    headline: `${s.topic}: ${solid.length} verified signal${solid.length === 1 ? "" : "s"} under degraded conditions`,
    summary: `Assembled without the synthesiser after upstream failures. Confidence ${(s.critique.confidence * 100).toFixed(0)}%. ${s.critique.gaps.length ? `Open gaps: ${s.critique.gaps.join("; ")}.` : ""}`,
    continuity: s.memoryDigest.includes("empty")
      ? "First sweep of this domain."
      : "Follow-up sweep; compare against stored briefings.",
    signals: s.evidence.map((e) => ({
      category: e.agent,
      title: e.title,
      insight: e.insight,
      impact: e.impact,
      source_hint: e.source_hint,
      is_new: true,
      confidence: e.confidence,
      disputed: e.title.toLowerCase().startsWith("contradiction:"),
    })),
    competitor_moves: [],
    opportunities: [],
    risks: s.critique.gaps,
    recommended_actions: ["Re-run the failed lanes once sources are reachable."],
  };
}
