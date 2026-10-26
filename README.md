# Curricula — AI study planner that adapts

Tell Curricula what you want to learn, your deadline, your daily time budget, and (optionally) paste a syllabus or notes. An LLM designs a sequenced curriculum. A scheduler packs it into your study days. As you go, you rate your confidence after each session. When you miss days or struggle with a topic, the AI coach re-plans what's left.

## Features

- **Structured generation**: the model returns topics, prerequisites, and typed sessions (learn / practice / review / assessment) as JSON. Zod defines the schema, which is sent as a JSON Schema constraint and used to validate the reply. If validation fails, the errors go back to the model for one corrected attempt.
- **Deterministic scheduling**: the model decides *what* to study. Code decides *when*. Sessions are packed into your chosen weekdays under a per-day minute budget, so dates are always valid and the plan can be repacked instantly without another model call.
- **Feedback loop**: completing a session asks how confident you feel (1–5). The app tracks per-topic average confidence and misses.
- **Adaptive re-planning**: a banner appears when sessions are overdue, a topic's confidence drops, or the projected finish passes the deadline. "Re-plan with AI" sends a compact progress summary to the model, which can:
  - add remediation sessions, either right away or alongside the topic
  - resize or remove pending sessions to fit the deadline
  - give study tips

  Changes are applied with guardrails: only pending sessions can be touched, assessments are kept, and unknown IDs are ignored. "Just push missed sessions forward" is a no-AI option.
- **Progress analytics**: completion, streak (counted in study days), time studied, projected finish vs. deadline, per-topic mastery, a 14-day activity chart, and a history of plan adjustments.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Zod · any OpenAI-compatible LLM API. Plans are stored in the browser's `localStorage`, so there's no database or login. Running it costs nothing.

## Running it

```bash
npm install
cp .env.example .env.local   # then set LLM_API_KEY
npm run dev
```

Open http://localhost:3000.

### Free model options

| Option | Setup | Notes |
| --- | --- | --- |
| **Groq** (default) | Free key from [console.groq.com/keys](https://console.groq.com/keys), no card. Set `LLM_API_KEY`. | Fast, and works when deployed. Free tier has per-minute rate limits. |
| **Ollama** (offline) | Install [Ollama](https://ollama.com), run `ollama pull qwen2.5:7b`, set `LLM_BASE_URL=http://localhost:11434/v1` and `LLM_MODEL=qwen2.5:7b`. | Runs on your own machine, so it only works locally. Slower. If long materials get cut off, raise Ollama's context length in its settings. |

Any other OpenAI-compatible provider works by setting `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`.

## Deploying to Netlify

1. Push the repo to GitHub and import it in Netlify. `netlify.toml` already sets the build.
2. Under **Site configuration → Environment variables**, add `LLM_API_KEY` (your Groq key).
3. Deploy. The key stays on the server: only the API routes read it.

## Code map

| Path | What it does |
| --- | --- |
| `src/lib/llm.ts` | Prompts, provider-neutral JSON calls with validate-and-retry, error mapping |
| `src/lib/schemas.ts` | Zod schemas for requests and model outputs |
| `src/lib/plan-builder.ts` | Turns model output into a plan; applies adaptations safely |
| `src/lib/scheduler.ts` | Packs sessions into study days; rolls missed work forward |
| `src/lib/analytics.ts` | Completion, streaks, topic mastery, on-track projection |
| `src/lib/progress.ts` | Client-side state transitions (complete, skip, quick reschedule) |
| `src/app/api/plan`, `src/app/api/adapt` | Route handlers for generation and re-planning |
| `src/app/plan/[id]/PlanView.tsx` | The dashboard |

## Ideas for next steps

- Persist plans server-side (Postgres or SQLite) with auth, so they sync across devices.
- Stream the generation so the curriculum appears as it's written.
- Use embeddings over uploaded materials (PDFs, notes) to cite sources in sessions.
- Add spaced-repetition scheduling of reviews based on confidence decay.
