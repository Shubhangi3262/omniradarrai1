export type SignalCategory = "research" | "patent" | "news" | "competitor" | "social";

export type IntelBriefing = {
  headline: string;
  summary: string;
  continuity?: string;
  signals: {
    category: SignalCategory;
    title: string;
    insight: string;
    impact: "high" | "medium" | "low";
    source_hint: string;
    is_new?: boolean;
    confidence?: number;
    disputed?: boolean;
  }[];
  competitor_moves: { name: string; move: string; implication: string }[];
  opportunities: string[];
  risks: string[];
  recommended_actions: string[];
};

export type PlanTask = {
  id: string;
  agent: SignalCategory;
  objective: string;
  priority: "high" | "medium" | "low";
};

export type TraceEvent = {
  t: number;
  node: string;
  status: "ok" | "warn" | "error" | "info";
  message: string;
};

export type Conflict = {
  claim: string;
  sides: string[];
  resolution: string;
  confidence: number;
};

export type Hypothesis = {
  statement: string;
  verdict: "supported" | "refuted" | "unverified";
  reasoning: string;
  confidence: number;
};

export type LaneReport = {
  agent: SignalCategory;
  objective: string;
  tool: string;
  degraded: boolean;
  findings: number;
};

export type AgentRunResult = {
  briefing: IntelBriefing;
  plan: PlanTask[];
  trace: TraceEvent[];
  conflicts: Conflict[];
  hypotheses: Hypothesis[];
  lanes: LaneReport[];
  critique: {
    confidence: number;
    coverage: string[];
    gaps: string[];
    verdict: string;
    replans: number;
  };
  budget: { limit: number; used: number; failures: number; fallbacks: number };
  threadId: string;
};

export type ChaosConfig = {
  toolFailureRate: number; // 0..1 — adversarial tool outages
  injectConflicts: boolean; // force contradictory evidence
  budgetLimit: number; // max model calls allowed for the whole run
};
