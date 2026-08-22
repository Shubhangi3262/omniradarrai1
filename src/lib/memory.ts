import type { IntelBriefing } from "./intel.functions";

export type MemoryEntry = {
  id: string;
  ts: number;
  topic: string;
  competitors?: string | undefined;
  headline: string;
  summary: string;
  keyFacts: string[];
};

const KEY = "signalscope:memory:v1";
const MAX_LONG_TERM = 20;
const SHORT_TERM_WINDOW = 4;

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadMemory(): MemoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as MemoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: MemoryEntry[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_LONG_TERM)));
  } catch {
    /* storage full or blocked — memory degrades to session only */
  }
}

export function rememberBriefing(
  input: { topic: string; competitors?: string },
  briefing: IntelBriefing,
): MemoryEntry[] {
  const entry: MemoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    topic: input.topic,
    competitors: input.competitors || undefined,
    headline: briefing.headline,
    summary: briefing.summary,
    keyFacts: [
      ...(briefing.signals ?? []).slice(0, 4).map((s) => `${s.category}: ${s.title}`),
      ...(briefing.competitor_moves ?? []).slice(0, 3).map((c) => `${c.name}: ${c.move}`),
    ],
  };
  const next = [entry, ...loadMemory()].slice(0, MAX_LONG_TERM);
  persist(next);
  return next;
}

export function forgetEntry(id: string): MemoryEntry[] {
  const next = loadMemory().filter((e) => e.id !== id);
  persist(next);
  return next;
}

export function clearMemory(): MemoryEntry[] {
  if (isBrowser()) window.localStorage.removeItem(KEY);
  return [];
}

/**
 * Short-term memory: the most recent runs on the same topic (the active thread of work).
 * Long-term memory: condensed headlines from every other tracked domain.
 */
export function buildMemoryContext(entries: MemoryEntry[], topic: string) {
  const t = topic.trim().toLowerCase();
  const shortTerm = entries
    .filter((e) => e.topic.trim().toLowerCase() === t)
    .slice(0, SHORT_TERM_WINDOW)
    .map((e) => ({
      when: new Date(e.ts).toISOString().slice(0, 10),
      headline: e.headline,
      summary: e.summary,
      keyFacts: e.keyFacts,
    }));

  const longTerm = entries
    .filter((e) => e.topic.trim().toLowerCase() !== t)
    .slice(0, 8)
    .map((e) => ({
      when: new Date(e.ts).toISOString().slice(0, 10),
      topic: e.topic,
      headline: e.headline,
    }));

  return { shortTerm, longTerm };
}
