import type { RunTracer } from "./tracer.server";
import type {
  ChaosSettings,
  Diagnosis,
  FullTrace,
  OptimizationConfig,
  SpanRecord,
  TraceRecord,
} from "./types";

type PersistInput = {
  tracer: RunTracer;
  topic: string;
  variant: string;
  experimentId: string | null;
  chaos: ChaosSettings;
  optimizations: OptimizationConfig;
  success: boolean;
  status: string;
  task_score: number;
  confidence: number;
  summary: Record<string, unknown>;
};

/** Flush the in-memory span buffer to Lovable Cloud. Never throws into the run. */
export async function persistTrace(input: PersistInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = input.tracer.metrics();

    const tracePayload = {
      trace_id: input.tracer.trace_id,
      experiment_id: input.experimentId,
      variant: input.variant,
      topic: input.topic,
      status: input.status,
      ended_at: new Date().toISOString(),
      started_at: new Date(input.tracer.t0).toISOString(),
      success: input.success,
      task_score: input.task_score,
      confidence: input.confidence,
      chaos: input.chaos,
      optimizations: input.optimizations,
      summary: input.summary,
      ...m,
    };
    const { error: traceErr } = await supabaseAdmin.from("agent_traces").insert(tracePayload as never);
    if (traceErr) {
      console.error("trace insert failed", traceErr);
      return;
    }

    const rows = input.tracer.spans.map((s) => ({
      trace_id: input.tracer.trace_id,
      span_id: s.span_id,
      parent_span_id: s.parent_span_id,
      name: s.name,
      kind: s.kind,
      status: s.status,
      start_offset_ms: s.start_offset_ms,
      duration_ms: s.duration_ms,
      model: s.model,
      prompt_tokens: s.prompt_tokens,
      completion_tokens: s.completion_tokens,
      cost_usd: s.cost_usd,
      attributes: s.attributes,
      events: s.events,
      error: s.error,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from("agent_spans").insert(rows.slice(i, i + 200) as never);
      if (error) console.error("span insert failed", error);
    }
  } catch (e) {
    console.error("persistTrace failed", e);
  }
}

export async function updateDiagnosis(traceId: string, diagnosis: Diagnosis): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("agent_traces")
    .update({ diagnosis } as never)
    .eq("trace_id", traceId);
  if (error) throw new Error(error.message);
}

export async function fetchTraces(limit = 25): Promise<TraceRecord[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("agent_traces")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TraceRecord[];
}

export async function fetchTrace(traceId: string): Promise<FullTrace | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: t, error: te }, { data: s, error: se }] = await Promise.all([
    supabaseAdmin.from("agent_traces").select("*").eq("trace_id", traceId).maybeSingle(),
    supabaseAdmin.from("agent_spans").select("*").eq("trace_id", traceId).order("start_offset_ms"),
  ]);
  if (te) throw new Error(te.message);
  if (se) throw new Error(se.message);
  if (!t) return null;
  return { trace: t as unknown as TraceRecord, spans: (s ?? []) as unknown as SpanRecord[] };
}
