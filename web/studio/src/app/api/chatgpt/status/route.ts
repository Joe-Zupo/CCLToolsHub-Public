import { NextResponse } from "next/server";

import { listModels, type Model } from "@/lib/chatgpt/responses";
import { chatGptSession } from "@/lib/chatgpt/session";

export const dynamic = "force-dynamic";

/** The connection, and the models this account can pick from. */
export async function GET() {
  const status = await chatGptSession().status();
  let models: Model[] = [];
  if (status.signedIn && status.planEnabled)
    models = await listModels().catch(() => []);
  return NextResponse.json(
    { ...status, models },
    { headers: { "Cache-Control": "no-store" } }
  );
}
