import { after } from "next/server";

import { deleteOwnerData } from "@/lib/clip-studio/store";
import { owner } from "@/lib/clip-studio/viewer";
import { removeMedia } from "@/lib/clip-studio/media";

/**
 * "Delete all my Clip Studio data": settings, videos and
 * clips. Database rows go first, so nothing points at a file being removed.
 */
export async function DELETE() {
  const urls = await deleteOwnerData(owner);
  if (urls.length) after(() => removeMedia(urls));
  return new Response(null, { status: 204 });
}
