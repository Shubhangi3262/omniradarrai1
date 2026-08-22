import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { EvaluationReport } from "./eval/types";

const Input = z.object({
  topic: z.string().min(2),
  competitors: z.string().optional().default(""),
  repeats: z.number().int().min(1).max(3).default(2),
  scenarios: z
    .array(z.enum(["normal", "ambiguous", "adversarial", "contradictory", "incomplete", "tool_failure"]))
    .min(1),
  includeBaseline: z.boolean().default(true),
});

export const runEvaluationSuite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<EvaluationReport> => {
    const { runEvaluation } = await import("./eval/runner.server");
    return runEvaluation(data);
  });
