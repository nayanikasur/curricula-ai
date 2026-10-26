"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addDays, weekdayName } from "@/lib/dates";
import { savePlan, useToday } from "@/lib/store";
import type { Level, Plan } from "@/lib/types";

const EXAMPLES = [
  "Pass the AWS Solutions Architect Associate exam",
  "Learn enough linear algebra to follow ML papers",
  "Get comfortable with conversational Spanish for a trip",
];

export default function NewPlan() {
  const today = useToday();
  return today ? <PlanForm today={today} /> : null;
}

function PlanForm({ today }: { today: string }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [startDate, setStartDate] = useState(today);
  const [deadline, setDeadline] = useState(() => addDays(today, 28));
  const [minutesPerDay, setMinutesPerDay] = useState(60);
  const [studyDays, setStudyDays] = useState([1, 2, 3, 4, 5]);
  const [materials, setMaterials] = useState("");
  const [preferences, setPreferences] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, level, startDate, deadline, minutesPerDay, studyDays, materials, preferences }),
      });
      const data = (await res.json()) as { plan?: Plan; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "Planning failed");
      savePlan(data.plan);
      router.push(`/plan/${data.plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed");
      setLoading(false);
    }
  }

  const toggleDay = (d: number) =>
    setStudyDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">New study plan</h1>
      <p className="mt-1 text-muted">The more context you give, the more tailored the plan.</p>

      <form onSubmit={submit} className="card mt-6 space-y-6 p-6">
        <div>
          <label className="label" htmlFor="goal">
            What do you want to learn or achieve?
          </label>
          <textarea
            id="goal"
            className="input min-h-20"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Build and deploy a full-stack app with Next.js and Postgres"
            required
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                type="button"
                key={ex}
                onClick={() => setGoal(ex)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Current level</span>
          <div className="grid grid-cols-3 gap-2">
            {(["beginner", "intermediate", "advanced"] as const).map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-lg border px-3 py-2 text-sm capitalize ${
                  level === l ? "border-accent bg-accent-soft font-medium text-accent" : "border-border"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="start">
              Start
            </label>
            <input id="start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="deadline">
              Deadline
            </label>
            <input id="deadline" type="date" className="input" value={deadline} min={addDays(startDate, 1)} onChange={(e) => setDeadline(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="minutes">
              Minutes per day
            </label>
            <input
              id="minutes"
              type="number"
              className="input"
              min={15}
              max={600}
              step={5}
              value={minutesPerDay}
              onChange={(e) => setMinutesPerDay(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div>
          <span className="label">Study days</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => toggleDay(d)}
                className={`w-12 rounded-lg border py-1.5 text-sm ${
                  studyDays.includes(d) ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted"
                }`}
              >
                {weekdayName(d)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="materials">
            Learning materials <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="materials"
            className="input min-h-32 font-mono text-xs"
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder="Paste a syllabus, table of contents, course outline, or notes. The plan will follow it."
          />
        </div>

        <div>
          <label className="label" htmlFor="prefs">
            Anything else? <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="prefs"
            className="input"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder="e.g. I learn best by building projects; I already know Python"
          />
        </div>

        {error && <div className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</div>}

        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading || studyDays.length === 0}>
          {loading ? "Designing your curriculum…" : "Generate plan"}
        </button>
      </form>
    </div>
  );
}
