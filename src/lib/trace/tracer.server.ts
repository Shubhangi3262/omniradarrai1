import { estimateCost } from "./cost";
import type { JsonValue, SpanEvent, SpanKind, SpanRecord, SpanStatus } from "./types";

const hex = (bytes: number) => {
  let s = "";
  for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return s;
};

export type StartSpanInput = {
  name: string;
  kind: SpanKind;
  parentSpanId?: string | null;
  attributes?: Record<string, JsonValue>;
};

export class Span {
  readonly span_id = hex(8);
  readonly startedAt = Date.now();
  private ended = false;
  events: SpanEvent[] = [];

  constructor(
    private tracer: RunTracer,
    readonly name: string,
    readonly kind: SpanKind,
    readonly parent_span_id: string | null,
    readonly attributes: Record<string, JsonValue>,
  ) {}

  set(attrs: Record<string, JsonValue>) {
    Object.assign(this.attributes, attrs);
    return this;
  }

  event(name: string, detail?: string) {
    this.events.push({ t: Date.now() - this.tracer.t0, name, ...(detail ? { detail } : {}) });
    return this;
  }

  usage(model: string, promptTokens: number, completionTokens: number) {
    this.attributes["model"] = model;
    this.attributes["prompt_tokens"] = promptTokens;
    this.attributes["completion_tokens"] = completionTokens;
    this.attributes["cost_usd"] = estimateCost(model, promptTokens, completionTokens);
    return this;
  }

  end(status: SpanStatus = "ok", attrs?: Record<string, JsonValue>) {
    if (this.ended) return this;
    this.ended = true;
    if (attrs) Object.assign(this.attributes, attrs);
    this.tracer.push(this.toRecord(status, null));
    return this;
  }

  fail(error: unknown, attrs?: Record<string, JsonValue>) {
    if (this.ended) return this;
    this.ended = true;
    if (attrs) Object.assign(this.attributes, attrs);
    const msg = error instanceof Error ? error.message : String(error);
    this.tracer.push(this.toRecord("error", msg));
    return this;
  }

  private toRecord(status: SpanStatus, error: string | null): SpanRecord {
    return {
      span_id: this.span_id,
      parent_span_id: this.parent_span_id,
      name: this.name,
      kind: this.kind,
      status,
      start_offset_ms: this.startedAt - this.tracer.t0,
      duration_ms: Date.now() - this.startedAt,
      model: (this.attributes["model"] as string) ?? null,
      prompt_tokens: Number(this.attributes["prompt_tokens"] ?? 0),
      completion_tokens: Number(this.attributes["completion_tokens"] ?? 0),
      cost_usd: Number(this.attributes["cost_usd"] ?? 0),
      attributes: this.attributes,
      events: this.events,
      error,
    };
  }
}

export class RunTracer {
  readonly trace_id = hex(16);
  readonly t0 = Date.now();
  readonly spans: SpanRecord[] = [];
  rootSpanId: string | null = null;

  push(record: SpanRecord) {
    this.spans.push(record);
  }

  startSpan(input: StartSpanInput): Span {
    const span = new Span(
      this,
      input.name,
      input.kind,
      input.parentSpanId ?? this.rootSpanId,
      { ...(input.attributes ?? {}) },
    );
    if (!this.rootSpanId && input.kind === "graph") this.rootSpanId = span.span_id;
    return span;
  }

  /** Convenience wrapper: auto-ends the span, recording thrown errors. */
  async withSpan<T>(input: StartSpanInput, fn: (span: Span) => Promise<T>): Promise<T> {
    const span = this.startSpan(input);
    try {
      const out = await fn(span);
      span.end("ok");
      return out;
    } catch (e) {
      span.fail(e);
      throw e;
    }
  }

  get elapsed() {
    return Date.now() - this.t0;
  }

  metrics() {
    const s = this.spans;
    const llm = s.filter((x) => x.kind === "llm");
    const tools = s.filter((x) => x.kind === "tool");
    const prompt_tokens = llm.reduce((a, x) => a + x.prompt_tokens, 0);
    const completion_tokens = llm.reduce((a, x) => a + x.completion_tokens, 0);
    return {
      duration_ms: this.elapsed,
      model_calls: llm.length,
      tool_calls: tools.length,
      tool_failures: tools.filter((x) => x.status === "error").length,
      fallbacks: s.filter((x) => x.attributes["fallback"] === true).length,
      retries: llm.reduce((a, x) => a + Number(x.attributes["attempt"] ?? 0), 0),
      error_count: s.filter((x) => x.status === "error").length,
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
      cost_usd: Number(s.reduce((a, x) => a + x.cost_usd, 0).toFixed(6)),
    };
  }
}

export const truncate = (s: string, n = 1200) => (s.length > n ? `${s.slice(0, n)}…[+${s.length - n} chars]` : s);
