import { NextResponse } from "next/server";
import { z } from "zod";

import {
  sampleJson,
  SampleError,
  type SampleMessage,
} from "@/lib/chatgpt/responses";
import { expandPrompts } from "@/lib/script-writer/prompts";

const body = z.object({
  messages: z
    .array(
      z.object({ role: z.enum(["user", "assistant"]), content: z.string() })
    )
    .min(1),
  images: z
    .array(
      z.object({
        mediaType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
        data: z.string(),
      })
    )
    .max(4)
    .optional(),
  modelTier: z.string().optional(),
  effort: z.enum(["low", "medium", "high"]).optional(),
});

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

/** One reply as JSON, on the person's own ChatGPT plan. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "Bad request.");

  try {
    const [first, ...rest] = parsed.data.messages as [
      SampleMessage,
      ...SampleMessage[],
    ];
    const result = await sampleJson({
      ...parsed.data,
      messages: [{ ...first, content: expandPrompts(first.content) }, ...rest],
      signal: request.signal,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof SampleError)
      return fail(502, error.code, error.message);
    return fail(500, "upstream_error", "Couldn't reach ChatGPT.");
  }
}
