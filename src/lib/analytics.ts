import { addDays, daysBetween } from "./dates";
import type { Plan, Session } from "./types";

export type TopicState = "not-started" | "in-progress" | "struggling" | "mastered";

export interface TopicStats {
  topicId: string;
  name: string;
  total: number;
  done: number;
  avgConfidence: number | null;
  misses: number;
  state: TopicState;
}

export interface Analytics {
  totalSessions: number;
  doneSessions: number;
  completion: number;
  minutesDone: number;
  minutesRemaining: number;
  streak: number;
  overdue: Session[];
  today: Session[];
  projectedFinish: string | null;
  daysLeft: number;
  /** Positive = finishing after the deadline by this many days. */
  slipDays: number;
  onTrack: boolean;
  topics: TopicStats[];
  struggling: TopicStats[];
  daily: { date: string; minutes: number; missed: number }[];
  /** Low-confidence or missed work logged since the last plan adjustment. */
  needsAttention: boolean;
}

const STRUGGLE_THRESHOLD = 2.5;

export function computeAnalytics(plan: Plan, today: string): Analytics {
  const active = plan.sessions.filter((s) => s.status !== "skipped");
  const done = active.filter((s) => s.status === "done");
  const pending = active.filter((s) => s.status === "pending");
  const overdue = pending.filter((s) => s.date < today).sort((a, b) => a.order - b.order);

  const topics: TopicStats[] = plan.topics.map((topic) => {
    const mine = active.filter((s) => s.topicId === topic.id);
    const mineDone = mine.filter((s) => s.status === "done");
    const rated = mineDone.filter((s) => s.confidence != null);
    const avgConfidence = rated.length ? rated.reduce((sum, s) => sum + s.confidence!, 0) / rated.length : null;
    const misses = mine.reduce((sum, s) => sum + s.missCount, 0);

    let state: TopicState = "not-started";
    if (avgConfidence != null && avgConfidence <= STRUGGLE_THRESHOLD) state = "struggling";
    else if (mine.length > 0 && mineDone.length === mine.length) state = "mastered";
    else if (mineDone.length > 0) state = "in-progress";

    return { topicId: topic.id, name: topic.name, total: mine.length, done: mineDone.length, avgConfidence, misses, state };
  });

  const projectedFinish = pending.length ? pending.reduce((max, s) => (s.date > max ? s.date : max), pending[0].date) : null;
  const slipDays = projectedFinish ? daysBetween(plan.constraints.deadline, projectedFinish) : 0;

  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    const minutes = plan.events
      .filter((e) => e.type === "done" && e.date === date)
      .reduce((sum, e) => sum + (e.type === "done" ? e.minutes : 0), 0);
    const missed = plan.events.filter((e) => e.type === "missed" && e.date === date).length;
    return { date, minutes, missed };
  });

  const lastAdjustment = plan.adjustments.at(-1)?.at ?? plan.createdAt;
  const recentStruggle = plan.sessions.some(
    (s) => s.status === "done" && (s.confidence ?? 5) <= 2 && (s.completedAt ?? "") > lastAdjustment,
  );

  return {
    totalSessions: active.length,
    doneSessions: done.length,
    completion: active.length ? done.length / active.length : 0,
    minutesDone: done.reduce((sum, s) => sum + s.minutes, 0),
    minutesRemaining: pending.reduce((sum, s) => sum + s.minutes, 0),
    streak: computeStreak(plan, today),
    overdue,
    today: pending.filter((s) => s.date === today).sort((a, b) => a.order - b.order),
    projectedFinish,
    daysLeft: Math.max(0, daysBetween(today, plan.constraints.deadline)),
    slipDays,
    onTrack: slipDays <= 0,
    topics,
    struggling: topics.filter((t) => t.state === "struggling"),
    daily,
    needsAttention: overdue.length > 0 || recentStruggle,
  };
}

/**
 * Consecutive scheduled study days with at least one completed session,
 * counting back from today. Non-study days don't break a streak, and today
 * only counts once something is done.
 */
function computeStreak(plan: Plan, today: string): number {
  const doneDays = new Set(plan.events.filter((e) => e.type === "done").map((e) => e.date));
  const studyDays = plan.constraints.studyDays;
  let streak = doneDays.has(today) ? 1 : 0;
  let day = addDays(today, -1);

  for (let i = 0; i < 365 && day >= plan.constraints.startDate; i++, day = addDays(day, -1)) {
    const weekdayIndex = new Date(day + "T00:00:00Z").getUTCDay();
    if (!studyDays.includes(weekdayIndex)) continue;
    if (!doneDays.has(day)) break;
    streak++;
  }
  return streak;
}
