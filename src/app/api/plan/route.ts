import { generateCurriculum, plannerErrorResponse } from "@/lib/llm";
import { buildPlan } from "@/lib/plan-builder";
import { CreatePlanRequest } from "@/lib/schemas";

// Plan generation is one model call that can take a while on long material.
export const maxDuration = 120;

export async function POST(request: Request) {
  const parsed = CreatePlanRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const curriculum = await generateCurriculum(parsed.data);
    const plan = buildPlan(parsed.data, curriculum, new Date().toISOString());
    return Response.json({ plan });
  } catch (err) {
    return plannerErrorResponse(err);
  }
}
