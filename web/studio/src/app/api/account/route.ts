import { NextResponse } from "next/server";

import { owner, store } from "@/lib/script-writer/server";

/** The paths of the member's documents, for export. Saved keys and consent records stay out of it. */
export async function GET() {
  const paths = await store.paths(owner);
  return NextResponse.json({
    paths: paths.filter(
      (path) => !["settings", "consent"].includes(path.split("/")[0] as string)
    ),
  });
}

/** Deletes everything the member has here, saved keys included. */
export async function DELETE() {
  await store.removeAll(owner);
  return NextResponse.json({ ok: true });
}
