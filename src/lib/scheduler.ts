import { addDays, weekday } from "./dates";
import type { Constraints, Plan, ProgressEvent, Session } from "./types";

// Hard stop so a misconfigured plan (e.g. no study days) can't loop forever.
const MAX_DAYS = 3 * 365;

/**
 * Packs pending sessions, in `order`, into study days starting at `from`.
 * Each day holds up to `minutesPerDay`; a session longer than a whole day
 * still gets its own day rather than being split. Completed and skipped
 * sessions keep their dates.
 */
export function packSessions(sessions: Session[], constraints: Constraints, from: string): Session[] {
  const studyDays = constraints.studyDays.length ? constraints.studyDays : [0, 1, 2, 3, 4, 5, 6];
  const pending = sessions.filter((s) => s.status === "pending").sort((a, b) => a.order - b.order);
  const dates = new Map<string, string>();

  let day = from;
  let guard = 0;
  const nextStudyDay = () => {
    while (!studyDays.includes(weekday(day)) && guard++ < MAX_DAYS) day = addDays(day, 1);
  };
  nextStudyDay();
  // Work already finished on the first day counts against that day's budget.
  let used = sessions.filter((s) => s.status === "done" && s.date === day).reduce((sum, s) => sum + s.minutes, 0);

  for (const session of pending) {
    if (used > 0 && used + session.minutes > constraints.minutesPerDay) {
      day = addDays(day, 1);
      used = 0;
      nextStudyDay();
    }
    dates.set(session.id, day);
    used += session.minutes;
  }

  return sessions.map((s) => (dates.has(s.id) ? { ...s, date: dates.get(s.id)! } : s));
}

/** Re-numbers `order` to 0..n-1 so later insertions have clean gaps to work with. */
export function normalizeOrder(sessions: Session[]): Session[] {
  const ranked = [...sessions].sort((a, b) => a.order - b.order);
  const rank = new Map(ranked.map((s, i) => [s.id, i]));
  return sessions.map((s) => ({ ...s, order: rank.get(s.id)! }));
}

/**
 * Logs every pending session dated before `today` as missed, then repacks the
 * remaining work from today. This is the no-AI "quick reschedule"; the AI
 * re-plan runs it too after applying its own changes.
 */
export function rollForward(plan: Plan, today: string): { plan: Plan; missed: Session[] } {
  const missed = plan.sessions.filter((s) => s.status === "pending" && s.date < today);
  const missedIds = new Set(missed.map((s) => s.id));
  const events: ProgressEvent[] = missed.map((s) => ({
    type: "missed",
    date: s.date,
    sessionId: s.id,
    topicId: s.topicId,
  }));

  const sessions = plan.sessions.map((s) => (missedIds.has(s.id) ? { ...s, missCount: s.missCount + 1 } : s));
  const from = today > plan.constraints.startDate ? today : plan.constraints.startDate;

  return {
    plan: {
      ...plan,
      sessions: packSessions(normalizeOrder(sessions), plan.constraints, from),
      events: [...plan.events, ...events],
    },
    missed,
  };
}
