import type { ScenarioId } from "./types";

/**
 * Human evaluation layer. Automated metrics cover what code and a judge model
 * can see; these five dimensions require a person. Ratings are stored locally
 * per scenario and folded into a blended score alongside the automated one.
 */
export const HUMAN_DIMENSIONS = [
  {
    id: "correctness",
    label: "Correctness",
    hint: "Are the claims true as far as you can tell, given the domain?",
  },
  {
    id: "usefulness",
    label: "Decision usefulness",
    hint: "Would you act on this briefing, or does it restate the obvious?",
  },
  {
    id: "evidence",
    label: "Evidence quality",
    hint: "Could you verify each signal from the hint provided?",
  },
  {
    id: "honesty",
    label: "Honesty under uncertainty",
    hint: "Did it admit what it did not know instead of filling the gap?",
  },
  {
    id: "coherence",
    label: "Reasoning coherence",
    hint: "Do plan, evidence, conflicts and conclusions line up?",
  },
] as const;

export type HumanDimension = (typeof HUMAN_DIMENSIONS)[number]["id"];
export type HumanRating = Partial<Record<HumanDimension, number>> & { notes?: string };
export type HumanRatings = Partial<Record<ScenarioId, HumanRating>>;

const KEY = "signalscope:human-eval:v1";

export function loadHumanRatings(): HumanRatings {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as HumanRatings;
  } catch {
    return {};
  }
}

export function saveHumanRating(scenario: ScenarioId, rating: HumanRating): HumanRatings {
  const next: HumanRatings = { ...loadHumanRatings(), [scenario]: rating };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — ratings stay in memory for this session */
  }
  return next;
}

export function clearHumanRatings(): HumanRatings {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return {};
}

/** Mean of all rated dimensions, normalised to 0..1 (ratings are 1..5). */
export function humanScore(ratings: HumanRatings): { score: number; rated: number } {
  const values: number[] = [];
  for (const r of Object.values(ratings)) {
    for (const d of HUMAN_DIMENSIONS) {
      const v = r?.[d.id];
      if (typeof v === "number") values.push((v - 1) / 4);
    }
  }
  return {
    score: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    rated: Object.keys(ratings).length,
  };
}

/** Agreement between the human panel and the automated grade for one scenario. */
export function humanAutoAgreement(rating: HumanRating | undefined, autoScore: number): number | null {
  if (!rating) return null;
  const values = HUMAN_DIMENSIONS.map((d) => rating[d.id]).filter((v): v is number => typeof v === "number");
  if (!values.length) return null;
  const human = (values.reduce((a, b) => a + b, 0) / values.length - 1) / 4;
  return 1 - Math.abs(human - autoScore);
}
