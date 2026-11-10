import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { jsonError } from "@/lib/api";
import { mediaPath } from "@/lib/clip-studio/media";

const stream = (path: string, range?: { start: number; end: number }) =>
  Readable.toWeb(createReadStream(path, range)) as ReadableStream;

/** Serves a video or clip. Range requests let the browser's player seek. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/clip-studio/files/[...path]">
) {
  const { path: parts } = await ctx.params;
  let path: string;
  let size: number;
  try {
    path = mediaPath(parts.join("/"));
    size = (await stat(path)).size;
  } catch {
    return jsonError(404, "No such file.");
  }

  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Cache-Control": "no-store",
  };
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!match) {
    return new Response(stream(path), {
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  const suffix = !match[1] && match[2] ? Number(match[2]) : null;
  const start = suffix !== null ? Math.max(size - suffix, 0) : Number(match[1]);
  const end =
    suffix === null && match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1;
  if (start > end || start >= size)
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  return new Response(stream(path, { start, end }), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}
