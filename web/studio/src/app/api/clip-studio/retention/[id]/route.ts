import { after } from "next/server";

import { z } from "zod";

import { jsonError } from "@/lib/api";
import { removeMedia } from "@/lib/clip-studio/media";
import { deleteRetentionVideo } from "@/lib/clip-studio/store";
import { owner } from "@/lib/clip-studio/viewer";

/** Deletes one of the Creator's retention videos and its file. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/clip-studio/retention/[id]">
) {
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return jsonError(404, "No such video.");
  const name = await deleteRetentionVideo(owner, id.data);
  if (!name) return jsonError(404, "No such video.");
  after(() => removeMedia([name]));
  return new Response(null, { status: 204 });
}
