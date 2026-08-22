/**
 * OpenTelemetry-compatible trace model for the OmniRadar agent.
 *
 * Every run produces one trace (32-hex trace id) and a tree of spans
 * (16-hex span ids) covering: graph, agent lanes, tool calls, LLM calls and
 * routing decisions — plus prompts, completions, token usage, latency,
 * retries, fallbacks and errors.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type SpanKind = "graph" | "agent" | "llm" | "tool" | "decision" | "chain" | "memory";

export type SpanStatus = "ok" | "warn" | "error";

export type SpanEvent = {
  t: number;
  name: string;
  detail?: string;
};

export type SpanRecord = {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  start_offset_ms: number;
  duration_ms: number;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  attributes: Record<string, JsonValue>;
  events: SpanEvent[];
  error: string | null;
};

export type TraceMetrics = {
  duration_ms: number;
  model_calls: number;
  tool_calls: number;
  tool_failures: number;
  fallbacks: number;
  retries: number;
  error_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  success: boolean;
  task_score: number;
  confidence: number;
};

export type TraceRecord = TraceMetrics & {
  trace_id: string;
  experiment_id: string | null;
  variant: string;
  topic: string;
  status: string;
  chaos: ChaosSettings;
  optimizations: OptimizationConfig;
  diagnosis: Diagnosis | null;
  summary: Record<string, JsonValue>;
  created_at: string;
};

export type FullTrace = {
  trace: TraceRecord;
  spans: SpanRecord[];
};

export type ChaosSettings = {
  toolFailureRate: number;
  injectConflicts: boolean;
  budgetLimit: number;
};

/**
 * Knobs the auto-diagnoser is allowed to turn. Every field is honoured by the
 * agent runtime, so a diagnosis produces a genuinely different execution.
 */
export type OptimizationConfig = {
  /** Ordered model fallback chain — reordered toward the most reliable model. */
  modelOrder: string[];
  /** Hard cap on model calls for the whole run. */
  budgetLimit: number;
  /** Max parallel specialist lanes the planner may open. */
  maxLanes: number;
  /** Memoise identical lane retrievals instead of re-calling the model. */
  toolCache: boolean;
  /** Trip a breaker after repeated live-tool outages and go straight to backup. */
  circuitBreaker: boolean;
  /** Attempts per model before falling back. */
  maxRetriesPerModel: number;
  /** Base backoff between attempts (ms). */
  backoffMs: number;
  /** Lanes whose live sweep is known-bad and should be skipped. */
  skipLiveSweepFor: string[];
  /** Skip the LLM verifier when it has proven unreliable/expensive. */
  fastPathVerifier: boolean;
};

export const DEFAULT_OPTIMIZATIONS: OptimizationConfig = {
  modelOrder: ["google/gemini-3.7-flash", "google/gemini-3.5-flash", "openai/gpt-5-mini"],
  budgetLimit: 16,
  maxLanes: 5,
  toolCache: false,
  circuitBreaker: false,
  maxRetriesPerModel: 2,
  backoffMs: 800,
  skipLiveSweepFor: [],
  fastPathVerifier: false,
};

export type RootCause = {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  evidence: string;
  affectedSpans: string[];
  metric: string;
  fix: string;
};

export type Diagnosis = {
  healthScore: number;
  rootCauses: RootCause[];
  rationale: string[];
  remediation: OptimizationConfig;
  changed: string[];
};

export type Comparison = {
  metric: string;
  label: string;
  before: number;
  after: number;
  delta: number;
  deltaPct: number;
  betterIsLower: boolean;
  improved: boolean;
  unit: string;
};
