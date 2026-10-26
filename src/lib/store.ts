"use client";

import { useSyncExternalStore } from "react";
import { localToday } from "./dates";
import type { Plan } from "./types";

// Plans are kept in localStorage: no accounts or database needed to try the app.
const KEY = "curricula.plans.v1";
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedPlans: Plan[] = [];

function read(): Plan[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode, sandboxed iframe): behave as empty.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedPlans = raw ? (JSON.parse(raw) as Plan[]) : [];
    } catch {
      cachedPlans = [];
    }
  }
  return cachedPlans;
}

function write(plans: Plan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    // Quota or blocked storage: keep going with in-memory state.
    cachedRaw = null;
    cachedPlans = plans;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** `null` during server render and hydration, the stored plans afterwards. */
export function usePlans(): Plan[] | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

const noopSubscribe = () => () => {};

/** Today's local date on the client; `null` during prerender so the server never bakes in a date. */
export function useToday(): string | null {
  return useSyncExternalStore(noopSubscribe, localToday, () => null);
}

export function savePlan(plan: Plan) {
  const plans = read();
  const exists = plans.some((p) => p.id === plan.id);
  write(exists ? plans.map((p) => (p.id === plan.id ? plan : p)) : [plan, ...plans]);
}

export function deletePlan(id: string) {
  write(read().filter((p) => p.id !== id));
}
