import { after } from "next/server";

import { removeMedia, withLocalLinks } from "@/lib/clip-studio/media";
import { refreshTranscription } from "@/lib/clip-studio/pipeline";
import { deleteJob, readJob } from "@/lib/clip-studio/store";
import { requireJob } from "@/lib/clip-studio/viewer";

/**
 * One job. While it is transcribing, each read also checks AssemblyAI once;
 * the read that sees the transcript finish starts finding clips.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/clip-studio/jobs/[id]">
) {
  const { id } = await ctx.params;
  const auth = await requireJob(id);
  if (!auth.ok) return auth.response;

  let job = auth.job;
  if (job.status === "transcribing") {
    try {
      const next = await refreshTranscription(auth.owner, id);
      if (next) after(next);
      job = (await readJob(auth.owner, id)) ?? job;
    } catch (error) {
      console.error(`[clip-studio] checking transcript of ${id}:`, error);
    }
  }
  return Response.json(
    { data: await withLocalLinks(job) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Deletes the job, its clips and their files. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/clip-studio/jobs/[id]">
) {
  const { id } = await ctx.params;
  const auth = await requireJob(id);
  if (!auth.ok) return auth.response;
  const urls = await deleteJob(auth.owner, id);
  if (urls.length) after(() => removeMedia(urls));
  return new Response(null, { status: 204 });
}
