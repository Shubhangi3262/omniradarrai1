import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AgentRunResult } from "./agent/types";

const Input = z.object({
  topic: z.string().min(2),
  competitors: z.string().optional(),
  focus: z.array(z.string()).optional(),
  threadId: z.string().optional(),
  chaos: z
    .object({
      toolFailureRate: z.number().min(0).max(1).default(0),
      injectConflicts: z.boolean().default(false),
      budgetLimit: z.number().min(4).max(40).default(16),
    })
    .default({ toolFailureRate: 0, injectConflicts: false, budgetLimit: 16 }),
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
      longTerm: z.array(z.object({ when: z.string(), topic: z.string(), headline: z.string() })).optional(),
    })
    .optional(),
});

function buildDigest(memory: z.infer<typeof Input>["memory"]) {
  const shortTerm = memory?.shortTerm ?? [];
  const longTerm = memory?.longTerm ?? [];
  return [
    shortTerm.length
      ? `SHORT-TERM MEMORY (previous sweeps of this domain, newest first):\n${shortTerm
          .map((m, i) => `${i + 1}. [${m.when}] ${m.headline} — ${m.summary}\n   known: ${m.keyFacts.join("; ")}`)
          .join("\n")}`
      : "SHORT-TERM MEMORY: empty — this is the first sweep of this domain.",
    longTerm.length
      ? `LONG-TERM MEMORY (other domains tracked):\n${longTerm.map((m) => `- [${m.when}] ${m.topic}: ${m.headline}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const runAgentGraph = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AgentRunResult> => {
    const { runIntelGraph } = await import("./agent/graph.server");
    return runIntelGraph({
      topic: data.topic,
      ...(data.competitors ? { competitors: data.competitors } : {}),
      ...(data.focus ? { focus: data.focus } : {}),
      ...(data.threadId ? { threadId: data.threadId } : {}),
      memoryDigest: buildDigest(data.memory),
      chaos: data.chaos,
    });
  });
