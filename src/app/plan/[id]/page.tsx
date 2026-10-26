import { Suspense } from "react";
import { PlanView } from "./PlanView";

// Plans live in the browser, so the dashboard renders entirely on the client.
export default function PlanPage() {
  return (
    <Suspense>
      <PlanView />
    </Suspense>
  );
}
