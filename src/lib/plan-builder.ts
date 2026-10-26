import { normalizeOrder, packSessions, rollForward } from "./scheduler";
import type { Adaptation, CreatePlanInput, GeneratedCurriculum } from "./schemas";
import type { Plan, Session, Topic } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Turns the model's curriculum into a scheduled plan, dropping anything that doesn't hang together. */
export function buildPlan(input: CreatePlanInput, curriculum: GeneratedCurriculum, now: string): Plan {
  const topicIds = new Set(curriculum.topics.map((t) => t.id));
  const topics: Topic[] = curriculum.topics.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    difficulty: clamp(t.difficulty, 1, 5),
    prerequisites: t.prerequisites.filter((p) => topicIds.has(p) && p !== t.id),
  }));

  const sessions: Session[] = curriculum.sessions
    .filter((s) => topicIds.has(s.topicId))
    .map((s, i) => ({
      id: `s${i + 1}`,
      topicId: s.topicId,
      title: s.title,
      kind: s.kind,
      minutes: clamp(s.minutes, 10, input.minutesPerDay),
      objectives: s.objectives.slice(0, 3),
      order: i,
      date: input.startDate,
      status: "pending",
      missCount: 0,
    }));

  if (sessions.length === 0) throw new Error("The model returned a curriculum with no usable sessions");

  const constraints = {
    startDate: input.startDate,
    deadline: input.deadline,
    minutesPerDay: input.minutesPerDay,
    studyDays: [...new Set(input.studyDays)].sort(),
  };

  return {
    id: crypto.randomUUID(),
    createdAt: now,
    title: curriculum.title,
    summary: curriculum.summary,
    goal: input.goal,
    level: input.level,
    materials: input.materials,
    constraints,
    topics,
    sessions: packSessions(sessions, constraints, input.startDate),
    events: [],
    adjustments: [],
  };
}

/**
 * Applies the coach's changes, then rolls overdue work forward and repacks
 * everything from today. Only pending sessions can be removed or resized, so
 * the model can never rewrite history.
 */
export function applyAdaptation(plan: Plan, adaptation: Adaptation, today: string, now: string): Plan {
  // Log misses and repack first so `date` reflects reality before new sessions are slotted in.
  const rolled = rollForward(plan, today).plan;

  const pendingIds = new Set(rolled.sessions.filter((s) => s.status === "pending").map((s) => s.id));
  const topicIds = new Set(rolled.topics.map((t) => t.id));
  const remove = new Set(adaptation.removeSessionIds.filter((id) => pendingIds.has(id)));
  const resize = new Map(
    adaptation.resizeSessions
      .filter((r) => pendingIds.has(r.sessionId))
      .map((r) => [r.sessionId, clamp(r.minutes, 10, plan.constraints.minutesPerDay)]),
  );

  let sessions: Session[] = rolled.sessions
    .filter((s) => !remove.has(s.id))
    .map((s) => (resize.has(s.id) ? { ...s, minutes: resize.get(s.id)! } : s));

  const pending = sessions.filter((s) => s.status === "pending");
  const firstPendingOrder = pending.length ? Math.min(...pending.map((s) => s.order)) : sessions.length;
  let nextId = Math.max(0, ...plan.sessions.map((s) => Number(s.id.slice(1)) || 0)) + 1;

  adaptation.newSessions
    .filter((s) => topicIds.has(s.topicId))
    .forEach((s, i) => {
      // Extra practice belongs before the topic's self-check, not after it.
      const lastOfTopic = pending.filter((p) => p.topicId === s.topicId && p.kind !== "assessment").at(-1);
      // Fractional orders slot between existing sessions; normalizeOrder cleans them up.
      const order =
        s.priority === "asap"
          ? firstPendingOrder - 1 + (i + 1) / 100
          : (lastOfTopic?.order ?? Math.max(...sessions.map((x) => x.order), 0)) + (i + 1) / 100;
      sessions.push({
        id: `s${nextId++}`,
        topicId: s.topicId,
        title: s.title,
        kind: s.kind,
        minutes: clamp(s.minutes, 10, plan.constraints.minutesPerDay),
        objectives: s.objectives.slice(0, 3),
        order,
        date: today,
        status: "pending",
        missCount: 0,
        addedBy: "coach",
      });
    });

  sessions = normalizeOrder(sessions);
  const from = today > plan.constraints.startDate ? today : plan.constraints.startDate;

  return {
    ...rolled,
    sessions: packSessions(sessions, plan.constraints, from),
    adjustments: [
      ...rolled.adjustments,
      { at: now, source: "ai", summary: adaptation.summary, changes: adaptation.changes, tips: adaptation.tips },
    ],
  };
}
