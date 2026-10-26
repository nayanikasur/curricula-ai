"use client";

import { useState } from "react";
import { parseDate, prettyDate } from "@/lib/dates";

interface Props {
  daily: { date: string; minutes: number; missed: number }[];
  target: number;
}

/** Minutes studied per day for the last two weeks, with the daily target as a reference line. */
export function ActivityChart({ daily, target }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(target, ...daily.map((d) => d.minutes), 1);
  const height = 120;
  const targetY = height - (target / max) * height;
  const active = hover != null ? daily[hover] : null;

  return (
    <div>
      <div className="mb-2 flex h-5 items-baseline justify-between text-xs text-muted">
        {active ? (
          <span>
            <span className="font-medium text-text">{prettyDate(active.date)}</span> · {active.minutes} min
            {active.missed > 0 && ` · ${active.missed} missed`}
          </span>
        ) : (
          <span>Last 14 days</span>
        )}
        <span>Target {target} min</span>
      </div>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
          style={{ top: targetY }}
        />
        <div className="absolute inset-0 flex items-end gap-0.5">
          {daily.map((d, i) => (
            <button
              key={d.date}
              aria-label={`${prettyDate(d.date)}: ${d.minutes} minutes${d.missed ? `, ${d.missed} missed` : ""}`}
              className="flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
            >
              <div
                className={`w-full max-w-5 rounded-t ${hover === i ? "bg-accent" : "bg-accent/70"}`}
                style={{ height: d.minutes ? Math.max(3, (d.minutes / max) * height) : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-0.5 border-t border-border pt-1 text-[10px] text-muted">
        {daily.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {i % 2 === 1 ? parseDate(d.date).getUTCDate() : ""}
            {d.missed > 0 && <div className="mx-auto mt-0.5 size-1.5 rounded-full bg-warn" title="Missed sessions" />}
          </div>
        ))}
      </div>
    </div>
  );
}
