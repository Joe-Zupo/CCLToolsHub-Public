import { NextResponse } from "next/server";
import { z } from "zod";

import { chatGptSession } from "@/lib/chatgpt/session";

const body = z.object({ accepted: z.literal(true) });

/** Starts Continue with ChatGPT, after the person accepts the notice. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Confirm you are 18 or older and have read the notice." },
      { status: 400 }
    );
  return NextResponse.json({ url: await chatGptSession().begin() });
}

/** Disconnects this computer from ChatGPT. */
export async function DELETE() {
  return NextResponse.json({ confirmed: await chatGptSession().signOut() });
}
