import { packSessions, rollForward } from "./scheduler";
import type { Plan, Session } from "./types";

// Pure state transitions for the dashboard. Each returns a new plan.

export function completeSession(plan: Plan, sessionId: string, confidence: number, today: string): Plan {
  const session = plan.sessions.find((s) => s.id === sessionId);
  if (!session || session.status !== "pending") return plan;

  // Finishing early or late moves the session onto the day it was actually done.
  const sessions = plan.sessions.map((s) =>
    s.id === sessionId
      ? { ...s, status: "done" as const, confidence, date: today, completedAt: new Date().toISOString() }
      : s,
  );

  return {
    ...plan,
    sessions: session.date === today ? sessions : repack(plan, sessions, today),
    events: [
      ...plan.events,
      { type: "done", date: today, sessionId, topicId: session.topicId, minutes: session.minutes, confidence },
    ],
  };
}

export function skipSession(plan: Plan, sessionId: string, today: string): Plan {
  const session = plan.sessions.find((s) => s.id === sessionId);
  if (!session || session.status !== "pending") return plan;
  const sessions = plan.sessions.map((s) => (s.id === sessionId ? { ...s, status: "skipped" as const } : s));
  return {
    ...plan,
    sessions: repack(plan, sessions, today),
    events: [...plan.events, { type: "skipped", date: today, sessionId, topicId: session.topicId }],
  };
}

/** No-AI fallback: log overdue sessions as missed and push everything forward. */
export function quickReschedule(plan: Plan, today: string): Plan {
  const { plan: next, missed } = rollForward(plan, today);
  if (missed.length === 0) return plan;
  return {
    ...next,
    adjustments: [
      ...next.adjustments,
      {
        at: new Date().toISOString(),
        source: "quick",
        summary: `Moved ${missed.length} missed session${missed.length === 1 ? "" : "s"} forward, starting today.`,
        changes: missed.map((s) => `Rescheduled "${s.title}"`),
        tips: [],
      },
    ],
  };
}

// Pull upcoming work forward into freed time. While anything is overdue the
// dates stay put: the learner decides how to reschedule via the coach banner.
function repack(plan: Plan, sessions: Session[], today: string): Session[] {
  if (sessions.some((s) => s.status === "pending" && s.date < today)) return sessions;
  const from = today > plan.constraints.startDate ? today : plan.constraints.startDate;
  return packSessions(sessions, plan.constraints, from);
}
