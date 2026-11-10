import { existsSync } from "node:fs";

import { z } from "zod";

import { jsonError } from "@/lib/api";
import { isUploadName, mediaLink, mediaPath } from "@/lib/clip-studio/media";
import {
  addRetentionVideo,
  listRetentionVideos,
} from "@/lib/clip-studio/store";
import type { RetentionVideoJson } from "@/lib/clip-studio/types";
import { owner } from "@/lib/clip-studio/viewer";

const withLink = (video: RetentionVideoJson) => ({
  ...video,
  url: mediaLink(video.url),
});

/** The Creator's retention videos, newest first. */
export async function GET() {
  const videos = await listRetentionVideos(owner);
  return Response.json(
    { data: videos.map(withLink) },
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

/** Keeps a video the browser already uploaded as a retention video. */
export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "That upload is not valid.");
  const { name, fileName, durationSec } = parsed.data;
  if (!isUploadName(name) || !existsSync(mediaPath(name)))
    return jsonError(400, "That upload was not found.");
  const video = await addRetentionVideo(owner, {
    fileName,
    url: name,
    durationSec,
  });
  return Response.json({ data: withLink(video) }, { status: 201 });
}
