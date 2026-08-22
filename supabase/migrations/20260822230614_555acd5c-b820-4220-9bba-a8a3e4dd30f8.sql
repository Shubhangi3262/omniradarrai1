CREATE TABLE public.agent_traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL UNIQUE,
  experiment_id TEXT,
  variant TEXT NOT NULL DEFAULT 'baseline',
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  model_calls INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  tool_failures INTEGER NOT NULL DEFAULT 0,
  fallbacks INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT false,
  task_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  chaos JSONB NOT NULL DEFAULT '{}'::jsonb,
  optimizations JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnosis JSONB,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_spans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  start_offset_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_spans_trace_idx ON public.agent_spans (trace_id);
CREATE INDEX agent_traces_created_idx ON public.agent_traces (created_at DESC);
CREATE INDEX agent_traces_experiment_idx ON public.agent_traces (experiment_id);

GRANT SELECT ON public.agent_traces TO anon;
GRANT SELECT ON public.agent_traces TO authenticated;
GRANT ALL ON public.agent_traces TO service_role;

GRANT SELECT ON public.agent_spans TO anon;
GRANT SELECT ON public.agent_spans TO authenticated;
GRANT ALL ON public.agent_spans TO service_role;

ALTER TABLE public.agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_spans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Traces are publicly readable" ON public.agent_traces FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Spans are publicly readable" ON public.agent_spans FOR SELECT TO anon, authenticated USING (true);