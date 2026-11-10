import { z } from "zod";

import { jsonError } from "@/lib/api";
import { checkKeyFormats } from "@/lib/clip-studio/key-format";
import { configJson, readConfig, updateConfig } from "@/lib/clip-studio/store";
import { owner } from "@/lib/clip-studio/viewer";

const updateSchema = z.object({
  displayName: z.string().max(60).optional(),
  assemblyAiKey: z.string().max(500).optional(),
});

/** The Creator's settings, without the secrets. */
export async function GET() {
  return Response.json({ data: configJson(await readConfig(owner)) });
}

/** Saves settings. A key left empty keeps its stored value. */
export async function PUT(request: Request) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Those settings are not valid.");
  const problems = checkKeyFormats(parsed.data);
  const first = Object.values(problems)[0];
  if (first) return Response.json({ error: first, problems }, { status: 400 });
  return Response.json({
    data: configJson(await updateConfig(owner, parsed.data)),
  });
}
