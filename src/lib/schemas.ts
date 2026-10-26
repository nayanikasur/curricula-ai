import { z } from "zod";

// ---- Request bodies -------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const CreatePlanRequest = z
  .object({
    goal: z.string().trim().min(3, "Tell us what you want to learn").max(500),
    materials: z.string().max(20_000).default(""),
    level: z.enum(["beginner", "intermediate", "advanced"]),
    startDate: isoDate,
    deadline: isoDate,
    minutesPerDay: z.number().int().min(15).max(600),
    studyDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one study day"),
    preferences: z.string().max(1_000).default(""),
  })
  .refine((v) => v.deadline > v.startDate, { message: "Deadline must be after the start date", path: ["deadline"] });

export type CreatePlanInput = z.infer<typeof CreatePlanRequest>;

// ---- LLM structured outputs ----------------------------------------------
// Sent to the model as JSON Schema and used to validate its reply. Kept free
// of numeric min/max so providers' constrained decoding accepts the schema;
// ranges are clamped in code after parsing.

const SessionKind = z.enum(["learn", "practice", "review", "assessment"]);

export const GeneratedCurriculum = z.object({
  title: z.string().describe("Short, motivating plan title (max ~6 words)"),
  summary: z.string().describe("Two sentences on the approach and what the learner will be able to do"),
  topics: z.array(
    z.object({
      id: z.string().describe("Short stable id like t1, t2"),
      name: z.string(),
      description: z.string().describe("One sentence"),
      difficulty: z.number().describe("1 (easy) to 5 (hard)"),
      prerequisites: z.array(z.string()).describe("Ids of topics that must come first"),
    }),
  ),
  sessions: z
    .array(
      z.object({
        topicId: z.string(),
        title: z.string(),
        kind: SessionKind,
        minutes: z.number().describe("Duration in minutes"),
        objectives: z.array(z.string()).describe("1-3 concrete, checkable outcomes"),
      }),
    )
    .describe("Every session in the order they should be studied"),
});

export type GeneratedCurriculum = z.infer<typeof GeneratedCurriculum>;

export const Adaptation = z.object({
  summary: z.string().describe("One or two sentences, addressed to the learner, on what changed and why"),
  newSessions: z.array(
    z.object({
      topicId: z.string(),
      title: z.string(),
      kind: SessionKind,
      minutes: z.number(),
      objectives: z.array(z.string()),
      priority: z
        .enum(["asap", "with-topic"])
        .describe("asap = next thing to study; with-topic = right after the topic's remaining sessions"),
    }),
  ),
  removeSessionIds: z.array(z.string()).describe("Pending sessions to drop, only when the deadline cannot otherwise be met"),
  resizeSessions: z.array(z.object({ sessionId: z.string(), minutes: z.number() })),
  changes: z.array(z.string()).describe("Each concrete change as a short bullet"),
  tips: z.array(z.string()).describe("1-3 short, specific study tips for the struggling areas"),
});

export type Adaptation = z.infer<typeof Adaptation>;

// The adapt route receives the whole client-side plan; validate the parts it relies on.
export const AdaptRequest = z.object({
  today: isoDate,
  plan: z
    .object({
      id: z.string(),
      goal: z.string(),
      level: z.string(),
      constraints: z.object({
        startDate: isoDate,
        deadline: isoDate,
        minutesPerDay: z.number(),
        studyDays: z.array(z.number()),
      }),
      topics: z.array(z.object({ id: z.string(), name: z.string() }).loose()),
      sessions: z.array(
        z
          .object({
            id: z.string(),
            topicId: z.string(),
            status: z.enum(["pending", "done", "skipped"]),
            minutes: z.number(),
            order: z.number(),
            date: z.string(),
          })
          .loose(),
      ),
      events: z.array(z.object({ type: z.string() }).loose()),
      adjustments: z.array(z.object({ at: z.string() }).loose()),
    })
    .loose(),
});
