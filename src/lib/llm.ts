import "server-only";
import { z } from "zod";
import { computeAnalytics } from "./analytics";
import { addDays, daysBetween, weekday, weekdayName } from "./dates";
import { Adaptation, GeneratedCurriculum, type CreatePlanInput } from "./schemas";
import type { Plan } from "./types";

// Any OpenAI-compatible chat endpoint works. Defaults target Groq's free tier;
// for fully offline development point LLM_BASE_URL at Ollama instead
// (http://localhost:11434/v1) and set LLM_MODEL to a pulled model.
const BASE_URL = (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b";
const API_KEY = process.env.LLM_API_KEY || "";
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE_URL);
// gpt-oss models think before answering; low effort keeps responses well inside
// serverless time limits. Other models don't accept the parameter, so it's opt-in by name.
const REASONING_EFFORT = process.env.LLM_REASONING_EFFORT || (MODEL.includes("gpt-oss") ? "low" : "");

// Hosted providers answer in seconds; local models on a laptop GPU can take minutes.
const TIMEOUT_MS = IS_LOCAL ? 300_000 : 60_000;

export class PlannerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function plannerErrorResponse(err: unknown): Response {
  if (err instanceof PlannerError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "Something went wrong while planning. Please try again." }, { status: 500 });
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ResponseFormat = { type: "json_schema"; json_schema: { name: string; schema: unknown } } | { type: "json_object" };

/**
 * Asks the model for JSON matching `schema`. The schema is sent both as a
 * response_format constraint and in the prompt (smaller models follow field
 * descriptions better when they can read them). If the reply fails Zod
 * validation, the errors are fed back once for a corrected attempt.
 */
async function structured<T>(schema: z.ZodType<T>, name: string, system: string, prompt: string): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${system}\n\nReply with a single JSON object that matches this JSON Schema. No prose, no code fences.\n${JSON.stringify(jsonSchema)}`,
    },
    { role: "user", content: prompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chat(messages, { type: "json_schema", json_schema: { name, schema: jsonSchema } });
    const result = schema.safeParse(parseJson(content));
    if (result.success) return result.data;

    const problems = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    messages.push(
      { role: "assistant", content },
      { role: "user", content: `That JSON did not match the schema (${problems}). Reply with the corrected JSON object only.` },
    );
  }
  throw new PlannerError("The model returned a plan in the wrong format twice. Please try again.", 502);
}

let jsonSchemaUnsupported = false;

async function chat(messages: ChatMessage[], format: ResponseFormat, rateLimitRetry = true): Promise<string> {
  if (!API_KEY && !IS_LOCAL) {
    throw new PlannerError("No LLM API key configured. Set LLM_API_KEY (a free Groq key works) in .env.local.", 503);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY && { Authorization: `Bearer ${API_KEY}` }) },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 8000,
        response_format: jsonSchemaUnsupported ? { type: "json_object" } : format,
        ...(REASONING_EFFORT && { reasoning_effort: REASONING_EFFORT }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new PlannerError("The model took too long to respond. Try a shorter timeline or retry.", 504);
    }
    throw new PlannerError(
      IS_LOCAL
        ? `Can't reach the local model at ${BASE_URL}. Is Ollama running, and have you run \`ollama pull ${MODEL}\`?`
        : `Can't reach the LLM provider at ${BASE_URL}.`,
      503,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Some models only support plain JSON mode; fall back once and remember.
    if (res.status === 400 && !jsonSchemaUnsupported && /response_format|json_schema/i.test(detail)) {
      jsonSchemaUnsupported = true;
      return chat(messages, format);
    }
    if (res.status === 401 || res.status === 403) throw new PlannerError("The LLM API key is missing or invalid.", 503);
    if (res.status === 404) throw new PlannerError(`Model "${MODEL}" wasn't found at ${BASE_URL}. Check LLM_MODEL.`, 503);
    // Free tiers meter tokens per minute; a short wait usually clears it.
    const retryAfter = Number(res.headers.get("retry-after"));
    if (res.status === 429 && rateLimitRetry && retryAfter > 0 && retryAfter <= 10) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return chat(messages, format, false);
    }
    if (res.status === 429) throw new PlannerError("Free-tier rate limit reached. Wait a minute and try again.", 429);
    throw new PlannerError(`LLM provider error (${res.status}): ${detail.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new PlannerError("The plan was too long to generate in one go. Try a narrower goal or shorter timeline.", 422);
  }
  return choice?.message?.content ?? "";
}

/** Tolerates code fences or stray prose around the JSON object. */
function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---- Plan generation ------------------------------------------------------

const CURRICULUM_SYSTEM = `You are an expert learning designer who builds realistic, personalized study plans.

You turn a learner's goal, level, materials and time budget into a sequenced curriculum of topics and study sessions.

How to design the plan:
- Break the goal into 4-10 topics ordered so prerequisites come first. Use ids t1, t2, ...
- Build sessions that mix kinds: "learn" for new material, "practice" for hands-on exercises, "review" for spaced repetition of earlier topics, "assessment" for a self-check at the end of a major topic or the whole plan.
- Insert short review sessions a few sessions after a topic is introduced, especially for harder topics.
- Size the whole plan to fit the time budget you are given. Total session minutes should land at roughly 85-95% of the available minutes, leaving slack for missed days. Never exceed it.
- Each session must fit inside one study day (no longer than the daily minutes). Prefer one or two sessions per study day, and no more than 40 sessions in total.
- Objectives must be concrete and checkable ("Implement binary search on a sorted array"), not vague ("Understand searching"). Keep them short.
- If the learner supplied materials (a syllabus, book chapters, links, notes), build the curriculum around them and reference them in session titles or objectives where it helps.
- Respect the learner's level: skip fundamentals an advanced learner already has; go slower for beginners.
- Every session's topicId must be one of the topic ids you defined.`;

export async function generateCurriculum(input: CreatePlanInput) {
  const studyDayCount = countStudyDays(input.startDate, input.deadline, input.studyDays);
  const budget = studyDayCount * input.minutesPerDay;

  const prompt = `<goal>${input.goal}</goal>
<level>${input.level}</level>
<time_budget>
Start: ${input.startDate}. Deadline: ${input.deadline}.
Study days: ${input.studyDays.map(weekdayName).join(", ")} (${studyDayCount} study days in range).
Daily budget: ${input.minutesPerDay} minutes.
Total available: ${budget} minutes. Plan for roughly ${Math.round(budget * 0.9)} minutes of sessions.
</time_budget>
${input.preferences ? `<preferences>${input.preferences}</preferences>\n` : ""}${
    input.materials ? `<materials>\n${input.materials}\n</materials>\n` : ""
  }
Design the curriculum.`;

  return structured(GeneratedCurriculum, "curriculum", CURRICULUM_SYSTEM, prompt);
}

// ---- Adaptive re-planning -------------------------------------------------

const ADAPT_SYSTEM = `You are an adaptive study coach. A learner is partway through a study plan. You see their progress, what they missed, and how confident they felt after each completed session. Adjust the remaining plan so they still reach their goal.

Principles:
- Missed sessions are already re-queued automatically. Do not re-create them.
- For struggling topics (low confidence), add targeted remediation: a "review" that revisits the weak spot from a different angle, or a "practice" session with easier, scaffolded exercises. Mark the first remediation for a struggling topic as priority "asap".
- Respect the deadline. Compare remaining minutes against available minutes. If the plan no longer fits, trim the lowest-value pending work: merge or shorten review/practice sessions on topics the learner is confident in, or remove optional sessions. Never remove "assessment" sessions or the last remaining "learn" session of a topic.
- If the learner is ahead or doing well, you may make no structural changes; return empty lists and give tips.
- Only reference session ids and topic ids that appear in the state you are given.
- Keep the summary warm, specific, and brief. No guilt about missed days.
- The summary, changes and tips are shown to the learner: refer to topics and sessions by name, never by id, and don't mention internal fields like "priority".`;

export async function generateAdaptation(plan: Plan, today: string) {
  return structured(Adaptation, "adaptation", ADAPT_SYSTEM, describeProgress(plan, today));
}

function describeProgress(plan: Plan, today: string): string {
  const a = computeAnalytics(plan, today);
  const from = today > plan.constraints.startDate ? today : plan.constraints.startDate;
  const available = countStudyDays(from, plan.constraints.deadline, plan.constraints.studyDays) * plan.constraints.minutesPerDay;
  const topicName = new Map(plan.topics.map((t) => [t.id, t.name]));

  const topics = a.topics
    .map(
      (t) =>
        `- ${t.topicId} "${t.name}": ${t.done}/${t.total} done, avg confidence ${
          t.avgConfidence?.toFixed(1) ?? "n/a"
        }/5, missed ${t.misses}x, state=${t.state}`,
    )
    .join("\n");

  const recent = plan.sessions
    .filter((s) => s.status === "done")
    .sort((x, y) => (y.completedAt ?? "").localeCompare(x.completedAt ?? ""))
    .slice(0, 10)
    .map((s) => `- ${s.id} [${topicName.get(s.topicId)}] "${s.title}" (${s.kind}) confidence ${s.confidence ?? "n/a"}/5`)
    .join("\n");

  const pending = plan.sessions
    .filter((s) => s.status === "pending")
    .sort((x, y) => x.order - y.order)
    .map(
      (s) =>
        `- ${s.id} [${s.topicId}] "${s.title}" (${s.kind}, ${s.minutes}m, scheduled ${s.date}${
          s.date < today ? ", OVERDUE" : ""
        }${s.missCount ? `, slipped ${s.missCount}x` : ""})`,
    )
    .join("\n");

  return `<goal>${plan.goal}</goal>
<level>${plan.level}</level>
<today>${today}</today>
<constraints>
Deadline: ${plan.constraints.deadline} (${daysBetween(today, plan.constraints.deadline)} days away).
Study days: ${plan.constraints.studyDays.map(weekdayName).join(", ")}, ${plan.constraints.minutesPerDay} min/day.
Available study minutes from today to the deadline: ${available}.
Remaining pending minutes (including overdue): ${a.minutesRemaining}.
</constraints>
<progress>
Completed ${a.doneSessions}/${a.totalSessions} sessions. Current streak: ${a.streak} study days.
Overdue sessions (will be re-queued): ${a.overdue.length}.
</progress>
<topics>
${topics}
</topics>
<recent_completions>
${recent || "(none yet)"}
</recent_completions>
<pending_sessions>
${pending || "(none)"}
</pending_sessions>

Adapt the remaining plan.`;
}

function countStudyDays(from: string, to: string, studyDays: number[]): number {
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (studyDays.includes(weekday(d))) count++;
  return count;
}
