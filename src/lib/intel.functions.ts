import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  topic: z.string().min(2),
  competitors: z.string().optional(),
  focus: z.array(z.string()).optional(),
  memory: z
    .object({
      shortTerm: z
        .array(
          z.object({
            when: z.string(),
            headline: z.string(),
            summary: z.string(),
            keyFacts: z.array(z.string()),
          }),
        )
        .optional(),
      longTerm: z
        .array(z.object({ when: z.string(), topic: z.string(), headline: z.string() }))
        .optional(),
    })
    .optional(),
});

export type IntelBriefing = {
  headline: string;
  summary: string;
  continuity?: string;
  signals: {
    category: "research" | "patent" | "news" | "competitor" | "social";
    title: string;
    insight: string;
    impact: "high" | "medium" | "low";
    source_hint: string;
    is_new?: boolean;
  }[];
  competitor_moves: { name: string; move: string; implication: string }[];
  opportunities: string[];
  risks: string[];
  recommended_actions: string[];
};

const SYSTEM = `You are an autonomous research & competitive intelligence agent.
You continuously track scientific publications, patent filings, industry news, competitor strategy and social chatter.
Given a monitoring brief, produce a concise, decision-ready intelligence briefing.
Be specific: name real labs, companies, journals, patent offices and technologies where you can.
Never invent URLs. For source_hint give the type/place to verify (e.g. "USPTO full-text search", "arXiv cs.LG", "company newsroom").
Keep every field tight: insights under 240 characters, actions under 160 characters.
You are given AGENT MEMORY: prior briefings you produced.
- SHORT-TERM MEMORY = your recent runs on this same domain. Do not repeat those findings verbatim; surface what changed, what advanced and what is genuinely new.
- LONG-TERM MEMORY = condensed headlines from other domains you track. Use it for cross-domain links only when relevant.
Use "continuity" to state, in one or two sentences, how this run relates to what you already knew (or say it is the first sweep).
Return ONLY JSON matching this shape:
{"headline":string,"summary":string,"continuity":string,"signals":[{"category":"research|patent|news|competitor|social","title":string,"insight":string,"impact":"high|medium|low","source_hint":string,"is_new":boolean}],"competitor_moves":[{"name":string,"move":string,"implication":string}],"opportunities":[string],"risks":[string],"recommended_actions":[string]}
Provide 6-8 signals, 3-5 competitor moves, 3-4 items in each list. Set is_new=false for a signal that merely updates something already in short-term memory.`;

export const runIntelAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<IntelBriefing> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured yet.");

    const shortTerm = data.memory?.shortTerm ?? [];
    const longTerm = data.memory?.longTerm ?? [];

    const prompt = [
      `Monitoring domain: ${data.topic}`,
      data.competitors ? `Competitors to track: ${data.competitors}` : "Competitors: identify the key players yourself.",
      data.focus?.length ? `Priority sources: ${data.focus.join(", ")}` : "",
      `Today's date: ${new Date().toISOString().slice(0, 10)}. Prioritise the most recent 6 months of activity.`,
      shortTerm.length
        ? `SHORT-TERM MEMORY (previous sweeps of this domain, newest first):\n${shortTerm
            .map(
              (m, i) =>
                `${i + 1}. [${m.when}] ${m.headline} — ${m.summary}\n   known: ${m.keyFacts.join("; ")}`,
            )
            .join("\n")}`
        : "SHORT-TERM MEMORY: empty — this is the first sweep of this domain.",
      longTerm.length
        ? `LONG-TERM MEMORY (other domains tracked):\n${longTerm
            .map((m) => `- [${m.when}] ${m.topic}: ${m.headline}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("The agent is rate limited. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to keep the agent running.");
      throw new Error(`Agent run failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(cleaned) as IntelBriefing;
    } catch {
      throw new Error("The agent returned an unreadable briefing. Run it again.");
    }
  });
