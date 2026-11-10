import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";

import { jsonError } from "@/lib/api";
import { newUploadName, prepareMediaFile } from "@/lib/clip-studio/media";
import { isLocalRequest } from "@/lib/local-request";

const MAX_BYTES = 5 * 1024 ** 3;

/**
 * Saves a video to this computer. `src/proxy.ts` skips this route, because a
 * proxy would buffer the whole video, so it makes the same local check itself.
 */
export async function POST(request: Request) {
  const local = isLocalRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    isApi: true,
  });
  if (!local) return jsonError(403, "This site only answers on this computer.");

  if (!request.body) return jsonError(400, "No video was sent.");
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    return jsonError(413, "Videos can be up to 5 GB.");

  const fileName = new URL(request.url).searchParams.get("name") ?? "";
  const name = newUploadName(fileName);
  const path = await prepareMediaFile(name);
  try {
    await pipeline(
      Readable.fromWeb(request.body as WebStream),
      createWriteStream(path)
    );
  } catch {
    await rm(path, { force: true });
    return jsonError(500, "The upload did not finish.");
  }
  return Response.json({ data: { name } }, { status: 201 });
}
