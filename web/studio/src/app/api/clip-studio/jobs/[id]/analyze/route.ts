import { after } from "next/server";

import { z } from "zod";

import { jsonError } from "@/lib/api";
import { blocked, claimAnalysis, preflight } from "@/lib/clip-studio/pipeline";
import { readConfig } from "@/lib/clip-studio/store";
import { MAX_CLIPS, MIN_CLIPS } from "@/lib/clip-studio/types";
import { requireJob } from "@/lib/clip-studio/viewer";

const bodySchema = z
  .object({ clipCount: z.number().int().min(MIN_CLIPS).max(MAX_CLIPS) })
  .partial();

/** Asks the agent for clips again, for a transcribed job. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/clip-studio/jobs/[id]/analyze">
) {
  const { id } = await ctx.params;
  const auth = await requireJob(id);
  if (!auth.ok) return auth.response;
  if (!["transcribed", "analyzed"].includes(auth.job.status))
    return jsonError(409, "Transcribe the video first.");

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return jsonError(400, `Ask for ${MIN_CLIPS} to ${MAX_CLIPS} clips.`);
  const clipCount = body.data.clipCount ?? auth.job.clipCount;

  const checks = await preflight(await readConfig(auth.owner), ["agent"]);
  const reason = blocked(checks);
  if (reason) return Response.json({ error: reason, checks }, { status: 412 });

  const run = await claimAnalysis(auth.owner, id, clipCount);
  if (!run) return jsonError(409, "Clips are already being found.");
  after(run);
  return Response.json({ data: { started: true } }, { status: 202 });
}
