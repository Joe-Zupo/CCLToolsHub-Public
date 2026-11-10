import { after } from "next/server";

import { z } from "zod";

import { jsonError } from "@/lib/api";
import { blocked, exportClip, preflight } from "@/lib/clip-studio/pipeline";
import { readConfig, upsertExport } from "@/lib/clip-studio/store";
import { requireJob } from "@/lib/clip-studio/viewer";

const exportSchema = z.object({
  clipId: z.string().max(20),
  format: z.enum(["vertical", "original"]).default("vertical"),
});

/** The agent edits one picked clip, then it is rendered and stored. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/clip-studio/jobs/[id]/export">
) {
  const { id } = await ctx.params;
  const auth = await requireJob(id);
  if (!auth.ok) return auth.response;

  if (!auth.job.sourceUrl)
    return jsonError(410, "The uploaded video was deleted. Upload it again.");

  const parsed = exportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Pick a clip.");
  const { clipId, format } = parsed.data;
  if (!auth.job.candidates.some((c) => c.id === clipId))
    return jsonError(400, "That clip is not in this job.");
  const current = auth.job.exports.find(
    (e) => e.clipId === clipId && e.format === format
  );
  if (
    current &&
    (current.status === "editing" || current.status === "rendering")
  )
    return jsonError(409, "That clip is already exporting.");

  const checks = await preflight(await readConfig(auth.owner), [
    "agent",
    "storage",
  ]);
  const reason = blocked(checks);
  if (reason) return Response.json({ error: reason, checks }, { status: 412 });

  await upsertExport(auth.owner, id, clipId, format, {
    status: "editing",
    error: null,
  });
  after(() => exportClip(auth.owner, id, clipId, format));
  return Response.json({ data: { started: true } }, { status: 202 });
}
