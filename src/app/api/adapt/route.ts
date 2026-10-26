import { generateAdaptation, plannerErrorResponse } from "@/lib/llm";
import { applyAdaptation } from "@/lib/plan-builder";
import { AdaptRequest } from "@/lib/schemas";
import type { Plan } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const parsed = AdaptRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  // Plans live in the browser, so the client sends the full plan; the schema checks the fields we rely on.
  const plan = parsed.data.plan as unknown as Plan;
  const { today } = parsed.data;

  try {
    const adaptation = await generateAdaptation(plan, today);
    return Response.json({ plan: applyAdaptation(plan, adaptation, today, new Date().toISOString()) });
  } catch (err) {
    return plannerErrorResponse(err);
  }
}
