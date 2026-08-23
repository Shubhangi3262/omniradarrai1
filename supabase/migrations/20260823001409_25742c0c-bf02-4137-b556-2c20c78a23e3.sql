ALTER TABLE public.agent_traces ALTER COLUMN cost_usd TYPE numeric(14,6);
ALTER TABLE public.agent_spans ALTER COLUMN cost_usd TYPE numeric(14,6);