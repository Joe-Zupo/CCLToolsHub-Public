import { after } from "next/server";

import { jsonError } from "@/lib/api";
import {
  CLIP_SETTINGS_ERROR,
  readClipSettings,
} from "@/lib/clip-studio/clip-settings";
import { blocked, claimAnalysis, preflight } from "@/lib/clip-studio/pipeline";
import { readConfig } from "@/lib/clip-studio/store";
import { requireJob } from "@/lib/clip-studio/viewer";

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

  const settings = readClipSettings(
    await request.json().catch(() => ({})),
    auth.job
  );
  if (!settings) return jsonError(400, CLIP_SETTINGS_ERROR);

  const checks = await preflight(await readConfig(auth.owner), ["agent"]);
  const reason = blocked(checks);
  if (reason) return Response.json({ error: reason, checks }, { status: 412 });

  const run = await claimAnalysis(auth.owner, id, settings);
  if (!run) return jsonError(409, "Clips are already being found.");
  after(run);
  return Response.json({ data: { started: true } }, { status: 202 });
}
