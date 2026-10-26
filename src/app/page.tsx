"use client";

import Link from "next/link";
import { computeAnalytics } from "@/lib/analytics";
import { prettyDate } from "@/lib/dates";
import { deletePlan, usePlans, useToday } from "@/lib/store";

export default function Home() {
  const plans = usePlans();
  const today = useToday();
  if (plans === null || today === null) return null;

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Plans that bend instead of break.</h1>
        <p className="mt-4 text-lg text-muted">
          Tell Curricula what you want to learn, how much time you have, and what you&apos;re working from. It builds a
          day-by-day curriculum, then re-plans around missed days and topics you find hard.
        </p>
        <Link href="/new" className="btn-primary mt-8 px-5 py-2.5 text-base">
          Build my first plan
        </Link>
        <div className="mt-14 grid gap-4 text-left sm:grid-cols-3">
          {[
            ["Structured, not generic", "Topics, prerequisites, and sessions sized to your daily budget and deadline."],
            ["Feedback after every session", "Rate your confidence. Low scores trigger targeted review sessions."],
            ["Adapts when you slip", "Missed a day? The coach reshuffles, trims, or extends so you still finish."],
          ].map(([title, body]) => (
            <div key={title} className="card p-4">
              <div className="font-medium">{title}</div>
              <div className="mt-1 text-sm text-muted">{body}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Your plans</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const a = computeAnalytics(plan, today);
          return (
            <div key={plan.id} className="card flex flex-col p-5">
              <Link href={`/plan/${plan.id}`} className="font-semibold hover:text-accent">
                {plan.title}
              </Link>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{plan.goal}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${a.completion * 100}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>
                  {a.doneSessions}/{a.totalSessions} sessions
                </span>
                <span>Due {prettyDate(plan.constraints.deadline)}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {a.overdue.length > 0 ? (
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                    {a.overdue.length} overdue
                  </span>
                ) : a.onTrack ? (
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">On track</span>
                ) : (
                  <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">
                    {a.slipDays}d behind
                  </span>
                )}
                <button
                  className="text-xs text-muted hover:text-bad"
                  onClick={() => confirm(`Delete "${plan.title}"?`) && deletePlan(plan.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
