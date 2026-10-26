export type Level = "beginner" | "intermediate" | "advanced";

export type SessionKind = "learn" | "practice" | "review" | "assessment";

export type SessionStatus = "pending" | "done" | "skipped";

export interface Topic {
  id: string;
  name: string;
  description: string;
  /** 1 (easy) – 5 (hard) */
  difficulty: number;
  prerequisites: string[];
}

export interface Session {
  id: string;
  topicId: string;
  title: string;
  kind: SessionKind;
  minutes: number;
  objectives: string[];
  /** Position in the learning sequence; the scheduler packs pending sessions in this order. */
  order: number;
  /** YYYY-MM-DD, assigned by the scheduler. */
  date: string;
  status: SessionStatus;
  /** How many times this session slipped past its scheduled date. */
  missCount: number;
  /** 1 (lost) – 5 (nailed it), captured when the session is completed. */
  confidence?: number;
  completedAt?: string;
  /** Set when the adaptive coach created this session. */
  addedBy?: "coach";
}

export type ProgressEvent =
  | { type: "done"; date: string; sessionId: string; topicId: string; minutes: number; confidence: number }
  | { type: "missed"; date: string; sessionId: string; topicId: string }
  | { type: "skipped"; date: string; sessionId: string; topicId: string };

export interface Adjustment {
  at: string;
  source: "ai" | "quick";
  summary: string;
  changes: string[];
  tips: string[];
}

export interface Constraints {
  startDate: string;
  deadline: string;
  minutesPerDay: number;
  /** 0 = Sunday … 6 = Saturday */
  studyDays: number[];
}

export interface Plan {
  id: string;
  createdAt: string;
  title: string;
  summary: string;
  goal: string;
  level: Level;
  materials: string;
  constraints: Constraints;
  topics: Topic[];
  sessions: Session[];
  events: ProgressEvent[];
  adjustments: Adjustment[];
}
