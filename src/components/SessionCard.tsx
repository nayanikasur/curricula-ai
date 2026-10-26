"use client";

import { useState } from "react";
import type { Session, Topic } from "@/lib/types";

const KIND_STYLES: Record<Session["kind"], string> = {
  learn: "bg-accent-soft text-accent",
  practice: "bg-good-soft text-good",
  review: "bg-warn-soft text-warn",
  assessment: "bg-surface-2 text-text",
};

const CONFIDENCE = ["Lost", "Shaky", "Okay", "Solid", "Nailed it"];

interface Props {
  session: Session;
  topic?: Topic;
  overdue?: boolean;
  onComplete?: (confidence: number) => void;
  onSkip?: () => void;
  compact?: boolean;
}

export function SessionCard({ session, topic, overdue, onComplete, onSkip, compact }: Props) {
  const [rating, setRating] = useState(false);
  const done = session.status === "done";

  return (
    <div className={`card p-4 ${done ? "opacity-60" : ""} ${overdue ? "border-warn/60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${KIND_STYLES[session.kind]}`}>
              {session.kind}
            </span>
            <span className="text-muted">{session.minutes} min</span>
            {topic && <span className="truncate text-muted">· {topic.name}</span>}
            {session.addedBy === "coach" && <span className="font-medium text-accent">· Added by coach</span>}
            {overdue && <span className="font-medium text-warn">· Overdue</span>}
          </div>
          <div className={`mt-1.5 font-medium ${done ? "line-through" : ""}`}>{session.title}</div>
          {!compact && session.objectives.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {session.objectives.map((o) => (
                <li key={o} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                  {o}
                </li>
              ))}
            </ul>
          )}
        </div>
        {done && session.confidence && (
          <span className="shrink-0 text-xs text-muted">{CONFIDENCE[session.confidence - 1]}</span>
        )}
      </div>

      {onComplete && !done && (
        <div className="mt-3">
          {rating ? (
            <div>
              <div className="mb-2 text-sm text-muted">How confident do you feel about this now?</div>
              <div className="grid grid-cols-5 gap-1.5">
                {CONFIDENCE.map((label, i) => (
                  <button
                    key={label}
                    className="btn-ghost px-1 text-xs"
                    onClick={() => {
                      setRating(false);
                      onComplete(i + 1);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button className="mt-2 text-xs text-muted hover:text-text" onClick={() => setRating(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setRating(true)}>
                Mark done
              </button>
              {onSkip && (
                <button className="btn-ghost" onClick={onSkip}>
                  Skip
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
