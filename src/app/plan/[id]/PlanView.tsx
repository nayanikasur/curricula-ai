"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActivityChart } from "@/components/ActivityChart";
import { SessionCard } from "@/components/SessionCard";
import { computeAnalytics, type Analytics, type TopicStats } from "@/lib/analytics";
import { prettyDate, weekdayName } from "@/lib/dates";
import { completeSession, quickReschedule, skipSession } from "@/lib/progress";
import { savePlan, usePlans, useToday } from "@/lib/store";
import type { Plan, Session } from "@/lib/types";

export function PlanView() {
  const { id } = useParams<{ id: string }>();
  const plans = usePlans();
  const today = useToday();

  if (plans === null || today === null) return null;
  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">This plan doesn&apos;t exist in this browser.</p>
        <Link href="/" className="btn-ghost mt-4">
          Back to plans
        </Link>
      </div>
    );
  }

  return <Dashboard plan={plan} today={today} />;
}

function Dashboard({ plan, today }: { plan: Plan; today: string }) {
  const a = computeAnalytics(plan, today);
  const topicById = new Map(plan.topics.map((t) => [t.id, t]));
  const [showAll, setShowAll] = useState(false);

  const upcoming = plan.sessions
    .filter((s) => s.status === "pending" && s.date > today)
    .sort((x, y) => x.date.localeCompare(y.date) || x.order - y.order);
  const byDay = groupByDate(showAll ? upcoming : upcoming.slice(0, 12));
  const doneToday = plan.sessions.filter((s) => s.status === "done" && s.date === today);

  const update = (next: Plan) => savePlan(next);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← All plans
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{plan.title}</h1>
        <p className="mt-1 max-w-3xl text-muted">{plan.summary}</p>
        <p className="mt-2 text-xs text-muted">
          {plan.constraints.minutesPerDay} min/day · {plan.constraints.studyDays.map(weekdayName).join(", ")} ·{" "}
          {prettyDate(plan.constraints.startDate)} → {prettyDate(plan.constraints.deadline)}
        </p>
      </div>

      <StatTiles a={a} />

      <CoachPanel plan={plan} a={a} today={today} onUpdate={update} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 font-semibold">Today · {prettyDate(today)}</h2>
            <div className="space-y-3">
              {a.overdue.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  topic={topicById.get(s.topicId)}
                  overdue
                  onComplete={(c) => update(completeSession(plan, s.id, c, today))}
                  onSkip={() => update(skipSession(plan, s.id, today))}
                />
              ))}
              {a.today.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  topic={topicById.get(s.topicId)}
                  onComplete={(c) => update(completeSession(plan, s.id, c, today))}
                  onSkip={() => update(skipSession(plan, s.id, today))}
                />
              ))}
              {doneToday.map((s) => (
                <SessionCard key={s.id} session={s} topic={topicById.get(s.topicId)} compact />
              ))}
              {a.overdue.length === 0 && a.today.length === 0 && (
                <div className="card p-5 text-sm text-muted">
                  {doneToday.length > 0
                    ? "All done for today. Nice work."
                    : upcoming.length > 0
                      ? `Nothing scheduled today. Next session: ${prettyDate(upcoming[0].date)}.`
                      : "Every session is complete. You made it."}
                </div>
              )}
            </div>
          </section>

          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Coming up</h2>
              <div className="space-y-5">
                {byDay.map(([date, sessions]) => (
                  <div key={date}>
                    <div className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{prettyDate(date)}</div>
                    <div className="space-y-2">
                      {sessions.map((s) => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          topic={topicById.get(s.topicId)}
                          compact
                          onComplete={(c) => update(completeSession(plan, s.id, c, today))}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {upcoming.length > 12 && (
                <button className="btn-ghost mt-4 w-full" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show less" : `Show all ${upcoming.length} upcoming sessions`}
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Study activity</h2>
            <ActivityChart daily={a.daily} target={plan.constraints.minutesPerDay} />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Topic mastery</h2>
            <div className="space-y-3">
              {a.topics.map((t) => (
                <TopicRow key={t.topicId} t={t} />
              ))}
            </div>
          </section>

          {plan.adjustments.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Plan history</h2>
              <ol className="space-y-4">
                {[...plan.adjustments].reverse().map((adj) => (
                  <li key={adj.at} className="text-sm">
                    <div className="text-xs text-muted">
                      {new Date(adj.at).toLocaleDateString()} · {adj.source === "ai" ? "AI coach" : "Quick reschedule"}
                    </div>
                    <div className="mt-1">{adj.summary}</div>
                    {adj.changes.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted">
                        {adj.changes.slice(0, 6).map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatTiles({ a }: { a: Analytics }) {
  const tiles = [
    {
      label: "Progress",
      value: `${Math.round(a.completion * 100)}%`,
      sub: `${a.doneSessions} of ${a.totalSessions} sessions`,
    },
    { label: "Streak", value: `${a.streak}`, sub: a.streak === 1 ? "study day" : "study days" },
    { label: "Time studied", value: formatMinutes(a.minutesDone), sub: `${formatMinutes(a.minutesRemaining)} to go` },
    {
      label: "Projected finish",
      value: a.projectedFinish ? prettyDate(a.projectedFinish).split(", ")[1] : "Done",
      sub: a.onTrack ? `On track · ${a.daysLeft} days left` : `${a.slipDays} days past deadline`,
      tone: a.onTrack ? "text-good" : "text-bad",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="text-xs text-muted">{t.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          <div className={`mt-0.5 text-xs ${t.tone ?? "text-muted"}`}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function CoachPanel({ plan, a, today, onUpdate }: { plan: Plan; a: Analytics; today: string; onUpdate: (p: Plan) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = plan.adjustments.at(-1);

  async function replan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, today }),
      });
      const data = (await res.json()) as { plan?: Plan; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "Re-planning failed");
      onUpdate(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-planning failed");
    } finally {
      setLoading(false);
    }
  }

  const reasons: string[] = [];
  if (a.overdue.length) reasons.push(`${a.overdue.length} session${a.overdue.length === 1 ? " is" : "s are"} overdue`);
  if (a.struggling.length) reasons.push(`you're finding ${a.struggling.map((t) => t.name).join(", ")} tough`);
  if (!a.onTrack) reasons.push(`the plan runs ${a.slipDays} days past your deadline`);

  if (!a.needsAttention && a.onTrack) {
    if (!latest || latest.tips.length === 0) return null;
    return (
      <div className="card border-accent/30 bg-accent-soft/40 p-5">
        <div className="text-sm font-medium text-accent">Coach notes</div>
        <p className="mt-1 text-sm">{latest.summary}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {latest.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="card border-warn/40 bg-warn-soft/50 p-5">
      <div className="text-sm font-medium text-warn">Your plan needs a tune-up</div>
      <p className="mt-1 text-sm">
        {reasons.length ? capitalize(reasons.join(", and ")) + "." : "Some recent sessions felt hard."} The AI coach can
        rebalance what&apos;s left: reschedule missed work, add targeted review, and trim lower-value sessions if time is
        short.
      </p>
      {error && <div className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={replan} disabled={loading}>
          {loading ? "Re-planning…" : "Re-plan with AI"}
        </button>
        {a.overdue.length > 0 && (
          <button className="btn-ghost" onClick={() => onUpdate(quickReschedule(plan, today))} disabled={loading}>
            Just push missed sessions forward
          </button>
        )}
      </div>
    </div>
  );
}

function TopicRow({ t }: { t: TopicStats }) {
  const badge = {
    "not-started": ["Not started", "text-muted"],
    "in-progress": ["In progress", "text-accent"],
    struggling: ["Needs work", "text-bad"],
    mastered: ["Mastered", "text-good"],
  }[t.state];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{t.name}</span>
        <span className={`shrink-0 text-xs font-medium ${badge[1]}`}>{badge[0]}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${t.state === "struggling" ? "bg-bad" : "bg-accent"}`}
          style={{ width: `${t.total ? (t.done / t.total) * 100 : 0}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted">
        {t.done}/{t.total} sessions
        {t.avgConfidence != null && ` · confidence ${t.avgConfidence.toFixed(1)}/5`}
      </div>
    </div>
  );
}

function groupByDate(sessions: Session[]): [string, Session[]][] {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) groups.set(s.date, [...(groups.get(s.date) ?? []), s]);
  return [...groups.entries()];
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
