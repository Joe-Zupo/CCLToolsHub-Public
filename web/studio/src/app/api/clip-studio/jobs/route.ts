import { existsSync } from "node:fs";

import { z } from "zod";

import { jsonError } from "@/lib/api";
import { isUploadName, mediaPath } from "@/lib/clip-studio/media";
import { createJob, listJobs } from "@/lib/clip-studio/store";
import { owner } from "@/lib/clip-studio/viewer";

/** The Creator's jobs, newest first. */
export async function GET() {
  return Response.json(
    { data: await listJobs(owner) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

const createSchema = z.object({
  name: z.string().max(200),
  fileName: z.string().trim().min(1).max(200),
  durationSec: z
    .number()
    .positive()
    .max(24 * 3600),
});

/**
 * Registers a video the browser already uploaded. Transcription is a separate
 * call, so its checks can refuse without losing the upload.
 */
export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "That upload is not valid.");

  const { name, fileName, durationSec } = parsed.data;
  if (!isUploadName(name) || !existsSync(mediaPath(name)))
    return jsonError(400, "That upload was not found.");

  const job = await createJob(owner, {
    fileName,
    sourceUrl: name,
    durationSec,
  });
  return Response.json({ data: job }, { status: 201 });
}
