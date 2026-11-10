import { NextResponse } from "next/server";
import { z } from "zod";

import { chatGptSession } from "@/lib/chatgpt/session";

const body = z.object({ model: z.string().min(1).max(100) });

/** Saves the model to use for scripts and clips. */
export async function PUT(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Pick a model." }, { status: 400 });
  await chatGptSession().setModel(parsed.data.model);
  return NextResponse.json({ model: parsed.data.model });
}
