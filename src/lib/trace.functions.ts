import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { ExperimentResult, SingleRunResult } from "./trace/experiment.server";

const ChaosSchema = z.object({
  toolFailureRate: z.number().min(0).max(1).default(0.35),
  injectConflicts: z.boolean().default(true),
  budgetLimit: z.number().min(4).max(40).default(16),
});

const RunInput = z.object({
  topic: z.string().min(2),
  competitors: z.string().optional(),
  chaos: ChaosSchema.default({ toolFailureRate: 0.35, injectConflicts: true, budgetLimit: 16 }),
});

/** One fully instrumented run. */
export const runTracedAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data }) => {
    const { runSingleTracedRun } = await import("./trace/experiment.server");
    return runSingleTracedRun({
      topic: data.topic,
      ...(data.competitors ? { competitors: data.competitors } : {}),
      chaos: data.chaos,
    });
  });

/** Controlled failure -> trace -> auto-diagnosis -> remediated run -> before/after metrics. */
export const runObservabilityExperiment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data }) => {
    const { runExperiment } = await import("./trace/experiment.server");
    return runExperiment({
      topic: data.topic,
      ...(data.competitors ? { competitors: data.competitors } : {}),
      chaos: data.chaos,
    });
  });

export const listTraces = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTraces } = await import("./trace/store.server");
  return fetchTraces(30);
});

export const getTraceDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ traceId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { fetchTrace } = await import("./trace/store.server");
    return fetchTrace(data.traceId);
  });
