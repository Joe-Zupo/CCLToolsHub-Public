import { z } from "zod";

import { jsonError } from "@/lib/api";
import {
  blocked,
  preflight,
  startTranscription,
} from "@/lib/clip-studio/pipeline";
import { readConfig } from "@/lib/clip-studio/store";
import { MAX_CLIPS, MIN_CLIPS } from "@/lib/clip-studio/types";
import { requireJob } from "@/lib/clip-studio/viewer";

const bodySchema = z
  .object({ clipCount: z.number().int().min(MIN_CLIPS).max(MAX_CLIPS) })
  .partial();

/** Starts transcription once AssemblyAI and storage all check out. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/clip-studio/jobs/[id]/transcribe">
) {
  const { id } = await ctx.params;
  const auth = await requireJob(id);
  if (!auth.ok) return auth.response;
  if (!["uploaded", "failed"].includes(auth.job.status))
    return jsonError(409, "This video is already transcribed or on its way.");

  if (!auth.job.sourceUrl)
    return jsonError(410, "The uploaded video was deleted. Upload it again.");

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return jsonError(400, `Ask for ${MIN_CLIPS} to ${MAX_CLIPS} clips.`);
  const clipCount = body.data.clipCount ?? auth.job.clipCount;

  const checks = await preflight(await readConfig(auth.owner), [
    "assemblyai",
    "storage",
  ]);
  const reason = blocked(checks);
  if (reason) return Response.json({ error: reason, checks }, { status: 412 });

  try {
    await startTranscription(auth.owner, id, clipCount);
  } catch (error) {
    return jsonError(
      502,
      error instanceof Error ? error.message : "AssemblyAI refused the video."
    );
  }
  return Response.json({ data: { started: true } }, { status: 202 });
}
