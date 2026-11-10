import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { owner, store } from "@/lib/script-writer/server";
import {
  BadPathError,
  fitList,
  MAX_DOC_BYTES,
  MAX_DOCS,
} from "@/lib/script-writer/store";

const putBody = z.object({
  path: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

/** Member Keys and consent records live in the same store. The page never reaches them here. */
const checkPath = (path: string) => {
  const first = path.split("/")[0];
  if (first === "settings" || first === "consent") throw new BadPathError(path);
  return path;
};

const guarded = async (run: () => Promise<Response>) => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BadPathError) return jsonError(400, "Bad path");
    throw error;
  }
};

/** `?doc=path` reads one document; `?collection=path` lists a collection. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const doc = params.get("doc");
  const collection = params.get("collection");
  const limit = Number(params.get("limit")) || undefined;
  const orderBy = params.get("orderBy") ?? undefined;

  return guarded(async () => {
    if (doc)
      return NextResponse.json({
        doc: await store.get(owner, checkPath(doc)),
      });
    if (collection)
      return NextResponse.json(
        fitList(
          await store.list(owner, checkPath(collection), {
            orderBy,
            limit,
          })
        )
      );
    return jsonError(400, "Name a doc or a collection");
  });
}

export async function PUT(request: Request) {
  const parsed = putBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Bad request");

  if (Buffer.byteLength(JSON.stringify(parsed.data.data)) > MAX_DOC_BYTES)
    return jsonError(413, "That document is too large.");

  return guarded(async () => {
    const path = checkPath(parsed.data.path);
    const paths = await store.paths(owner);
    if (paths.length >= MAX_DOCS && !paths.includes(path))
      return jsonError(413, "You have too many saved items. Delete a few.");
    await store.set(owner, path, parsed.data.data);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(request: Request) {
  const doc = new URL(request.url).searchParams.get("doc");
  if (!doc) return jsonError(400, "Name a doc");

  return guarded(async () => {
    await store.remove(owner, checkPath(doc));
    return NextResponse.json({ ok: true });
  });
}
