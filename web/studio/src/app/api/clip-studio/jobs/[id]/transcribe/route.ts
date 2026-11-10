import { jsonError } from "@/lib/api";
import {
  CLIP_SETTINGS_ERROR,
  readClipSettings,
} from "@/lib/clip-studio/clip-settings";
import { explainFailure } from "@/lib/clip-studio/errors";
import {
  blocked,
  preflight,
  startTranscription,
} from "@/lib/clip-studio/pipeline";
import { readConfig } from "@/lib/clip-studio/store";
import { requireJob } from "@/lib/clip-studio/viewer";

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

  const settings = readClipSettings(
    await request.json().catch(() => ({})),
    auth.job
  );
  if (!settings) return jsonError(400, CLIP_SETTINGS_ERROR);

  const checks = await preflight(await readConfig(auth.owner), [
    "assemblyai",
    "storage",
  ]);
  const reason = blocked(checks);
  if (reason) return Response.json({ error: reason, checks }, { status: 412 });

  try {
    await startTranscription(auth.owner, id, settings);
  } catch (error) {
    console.error(`[clip-studio] starting transcript of ${id}:`, error);
    return jsonError(502, explainFailure(error, "transcribe"));
  }
  return Response.json({ data: { started: true } }, { status: 202 });
}
