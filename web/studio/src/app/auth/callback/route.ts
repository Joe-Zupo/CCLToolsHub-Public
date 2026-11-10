import { NextResponse } from "next/server";

import { STUDIO_ORIGIN } from "@/lib/chatgpt/oauth";
import { chatGptSession } from "@/lib/chatgpt/session";

/** Where OpenAI sends the browser back after Continue with ChatGPT. */
export async function GET(request: Request) {
  const result = await chatGptSession().finish(
    new URL(request.url).searchParams
  );
  return NextResponse.redirect(
    `${STUDIO_ORIGIN}/settings?chatgpt=${result}`,
    303
  );
}
