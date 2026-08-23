## Insight Agent
OmniRadar AI is an autonomous multi-agent intelligence platform built on LangGraph, designed to continuously research and monitor any domain — technical, competitive, or scientific — and turn scattered signals into a single decision-ready briefing.

At its core is an orchestrated agent graph, not a single chatbot: a planner breaks down a monitoring objective into specialist tasks across five signal categories (research, patents, news, competitors, social); parallel specialist agents investigate each lane using a three-tier tool fallback chain (live retrieval → degraded retrieval → memory-only archive recall), so individual failures degrade gracefully instead of crashing the run; a reconciliation stage adjudicates contradictory evidence between sources rather than averaging it away; a verifier proposes falsifiable hypotheses and tests them strictly against the gathered evidence; and a critic self-evaluates confidence, coverage, and gaps, triggering autonomous replanning when the answer isn't good enough — with loop and deadlock detection so it can't spin forever.

The system maintains both short-term (per-run) and long-term (cross-run) memory digests for continuity between sweeps, tracks a hard execution budget with model-fallback chains (across multiple LLMs) and retry/backoff logic, and includes a built-in chaos-testing mode that can inject simulated tool outages and conflicting evidence to demonstrate resilience under adversarial conditions. Every run produces a full execution trace, a plan, resolved conflicts, tested hypotheses, per-lane reports, and a final structured briefing — headline, signals, competitor moves, opportunities, risks, and recommended actions — all exposed through a modern React/TanStack Start interface

## Evaluation
OmniRadar AI ships with an automated evaluation suite (Run evaluation suite) that scores the agent against measurable criteria rather than anecdotal testing, combining automated metrics with a human-review gate.

Test scenarios. Each run is evaluated across 6 scenario types — normal operation, ambiguous request, adversarial input, contradictory evidence, incomplete information, and tool failure/outage — with repeated runs per scenario (2 repeats) to measure consistency, and results compared against a baseline.

Metrics measured:

Category	Metrics
Correctness	Accuracy, Groundedness, Hallucination rate (lower is better)
Task success	Task Completion, Pass Rate, Reliability
Resilience	Robustness (stress vs. normal score), Recovery, Consistency (agreement across repeats)
Trustworthiness	Evidence Quality, Calibration, Refusal Discipline (declining unsupported conclusions)
Performance	Efficiency (completion per model call), Latency (mean per run)
Oversight	Human panel review
Example run (6 scenarios × 2 repeats, 240s wall clock, ~16 model calls/run avg):

Overall score: 73%
Accuracy 82% · Groundedness 94% · Hallucination 22% (lower is better)
Task Completion 77% · Reliability 100%
Robustness 87% · Consistency 60% · Recovery 86%
Evidence Quality 86% · Calibration 68% · Refusal Discipline 79%
Efficiency 35% · Latency 17.1s mean/run
This is intentionally an honest scorecard, not a marketing number — it surfaces exactly where the system is weak (in this run: consistency across repeats, and 0/6 scenarios fully clearing every gate) alongside where it's strong (groundedness, reliability, recovery from failures), which is the point of measuring against explicit criteria instead of just claiming the agent "works."

# Insightful Trace

analysis  the file i have uploaded and if their is any error fix it and now 

7. Advanced Tracing & Observability

Implement end-to-end tracing of agents, prompts, decisions, tool calls, latency, token usage, and errors. Introduce a controlled failure and use the trace to *identify the root cause, automatically diagnose it, and improve the system*. Demonstrate measurable before-vs-after improvements in execution time, tool calls, errors, or task success rate.

*LangSmith, Langfuse, OpenTelemetry, or equivalent may be used.*
now i want to make it more advanced so do changes accordingly as i told you above all parameters should coverd  i want every single parameter from above and make it effective without any error

This project was built with [Signal scope](https://lovable.dev).

**Live app**: https://omniradarrai1.lovable.app

## Build with Signal scope 

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a67690c5-2510-4406-b551-c7984c27f6a0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
