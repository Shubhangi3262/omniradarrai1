import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SpanRecord } from "@/lib/trace/types";

const kindTone: Record<string, string> = {
  graph: "bg-primary/70",
  agent: "bg-chart-2",
  llm: "bg-chart-1",
  tool: "bg-chart-3",
  decision: "bg-chart-4",
  chain: "bg-chart-5",
  memory: "bg-muted-foreground",
};

const statusTone: Record<string, string> = {
  ok: "border-primary/40 text-primary",
  warn: "border-chart-4/60 text-chart-4",
  error: "border-destructive/60 text-destructive",
};

export function SpanWaterfall({ spans }: { spans: SpanRecord[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!spans.length) return <p className="text-sm text-muted-foreground">No spans recorded.</p>;

  const total = Math.max(...spans.map((s) => s.start_offset_ms + s.duration_ms), 1);
  const depth = (s: SpanRecord, seen = 0): number => {
    if (!s.parent_span_id || seen > 6) return 0;
    const parent = spans.find((x) => x.span_id === s.parent_span_id);
    return parent ? 1 + depth(parent, seen + 1) : 0;
  };
  const ordered = [...spans].sort((a, b) => a.start_offset_ms - b.start_offset_ms);

  return (
    <div className="space-y-1">
      {ordered.map((s) => {
        const isOpen = open === s.span_id;
        return (
          <div key={s.span_id} className="rounded-md border border-border/60 bg-card/40">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : s.span_id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              <span
                className="w-56 shrink-0 truncate font-mono text-xs"
                style={{ paddingLeft: `${depth(s) * 12}px` }}
                title={s.name}
              >
                {s.name}
              </span>
              <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted/40">
                <span
                  className={`absolute inset-y-0 rounded-full ${s.status === "error" ? "bg-destructive" : (kindTone[s.kind] ?? "bg-primary")}`}
                  style={{
                    left: `${(s.start_offset_ms / total) * 100}%`,
                    width: `${Math.max(0.8, (s.duration_ms / total) * 100)}%`,
                  }}
                />
              </span>
              <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {s.duration_ms} ms
              </span>
              <Badge variant="outline" className={`shrink-0 text-[10px] ${statusTone[s.status] ?? ""}`}>
                {s.kind}
              </Badge>
            </button>
            {isOpen ? (
              <div className="space-y-2 border-t border-border/50 px-4 py-3 text-xs">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Field label="Span" value={s.span_id} />
                  <Field label="Parent" value={s.parent_span_id ?? "—"} />
                  <Field label="Model" value={s.model ?? "—"} />
                  <Field
                    label="Tokens"
                    value={`${s.prompt_tokens} in / ${s.completion_tokens} out · $${s.cost_usd.toFixed(5)}`}
                  />
                </div>
                {s.error ? (
                  <p className="rounded bg-destructive/10 px-2 py-1 font-mono text-destructive">{s.error}</p>
                ) : null}
                {s.events.length ? (
                  <ul className="space-y-0.5 font-mono text-muted-foreground">
                    {s.events.map((e, i) => (
                      <li key={i}>
                        +{e.t}ms · {e.name}
                        {e.detail ? ` — ${e.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <pre className="max-h-64 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(s.attributes, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-mono">{value}</p>
    </div>
  );
}
