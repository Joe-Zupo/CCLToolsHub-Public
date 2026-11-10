import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRequest,
  listModels,
  pageCode,
  parseReply,
  sampleJson,
  SampleError,
} from "./responses";
import { NotConnectedError, type ChatGptSession } from "./session";

const sse = (events: unknown[]) =>
  new Response(
    events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join(""),
    { status: 200 }
  );

const reply = (text: string) =>
  sse([
    { type: "response.output_text.delta", delta: text.slice(0, 3) },
    { type: "response.output_text.delta", delta: text.slice(3) },
    { type: "response.completed", response: {} },
  ]);

const failure = (status: number, code: string, param?: string) =>
  new Response(JSON.stringify({ error: { code, param, message: code } }), {
    status,
  });

function fakeSession(overrides: Partial<ChatGptSession> = {}): ChatGptSession {
  return {
    status: async () => ({
      signedIn: true,
      planEnabled: true,
      email: null,
      model: "gpt-test",
    }),
    token: async () => "token",
    ...overrides,
  } as ChatGptSession;
}

function run(
  responses: Response[],
  options: Partial<Parameters<typeof sampleJson>[0]> = {}
) {
  const bodies: Record<string, unknown>[] = [];
  const headers: Headers[] = [];
  const fetcher = (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    headers.push(new Headers(init?.headers));
    const next = responses.shift();
    if (!next) throw new Error("no more replies");
    return next;
  }) as typeof fetch;
  return {
    bodies,
    headers,
    result: sampleJson({
      messages: [{ role: "user", content: "hello" }],
      session: fakeSession(),
      fetcher,
      sleep: async () => undefined,
      ...options,
    }),
  };
}

const code = (expected: string) => (error: unknown) =>
  error instanceof SampleError && error.code === expected;

describe("buildRequest", () => {
  it("turns the page's rules into instructions and keeps real turns", () => {
    const { instructions, input } = buildRequest([
      { role: "user", content: "RULES" },
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ]);
    assert.match(instructions, /^RULES\n\nReply with one JSON object only/);
    assert.deepEqual(input, [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ]);
  });

  it("never sends a system-role item", () => {
    const { input } = buildRequest([
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);
    assert.ok(input.every((item) => item.role !== ("system" as string)));
  });

  it("puts images on the last user turn as data URLs", () => {
    const { input } = buildRequest(
      [{ role: "user", content: "look" }],
      [{ mediaType: "image/png", data: "QUJD" }]
    );
    assert.deepEqual(input[0]?.content, [
      { type: "input_text", text: "look" },
      { type: "input_image", image_url: "data:image/png;base64,QUJD" },
    ]);
  });
});

describe("parseReply", () => {
  it("reads plain, fenced and wrapped JSON", () => {
    assert.deepEqual(parseReply('{"a":1}'), { a: 1 });
    assert.deepEqual(parseReply('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseReply('Here: {"a":1} done'), { a: 1 });
  });

  it("names empty and broken replies", () => {
    assert.throws(() => parseReply(" "), code("empty_completion"));
    assert.throws(() => parseReply("nope"), code("invalid_json"));
  });
});

describe("sampleJson", () => {
  it("sends the required fields and none of the unsupported ones", async () => {
    const { result, bodies, headers } = run([reply('{"ok":true}')]);
    assert.deepEqual(await result, { ok: true });
    const body = bodies[0] ?? {};
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal(body.model, "gpt-test");
    assert.equal(headers[0]?.get("authorization"), "Bearer token");
    for (const field of [
      "temperature",
      "top_p",
      "max_output_tokens",
      "previous_response_id",
      "metadata",
      "user",
    ])
      assert.ok(!(field in body), field);
  });

  it("passes effort as reasoning, and drops it if the model refuses", async () => {
    const { result, bodies } = run(
      [
        failure(
          400,
          "subscription_sharing_unsupported_capability",
          "reasoning.effort"
        ),
        reply("{}"),
      ],
      { effort: "low" }
    );
    await result;
    assert.deepEqual(bodies[0]?.reasoning, { effort: "low" });
    assert.equal(bodies[1]?.reasoning, undefined);
  });

  it("fails on a usage limit that arrives mid-stream", async () => {
    const { result } = run([
      sse([
        { type: "response.output_text.delta", delta: "{" },
        {
          type: "response.failed",
          response: {
            error: { code: "subscription_sharing_usage_limit_exceeded" },
          },
        },
      ]),
    ]);
    await assert.rejects(result, code("rate_limited"));
  });

  it("does not accept a stream that ends without completing", async () => {
    const { result } = run([
      sse([{ type: "response.output_text.delta", delta: "{}" }]),
    ]);
    await assert.rejects(result, code("upstream_error"));
  });

  it("retries a passing outage a bounded number of times", async () => {
    const ok = run([failure(503, "x"), failure(503, "x"), reply("{}")]);
    assert.deepEqual(await ok.result, {});
    assert.equal(ok.bodies.length, 3);
    const out = run([failure(503, "x"), failure(503, "x"), failure(503, "x")]);
    await assert.rejects(out.result, code("upstream_error"));
    assert.equal(out.bodies.length, 3);
  });

  it("does not retry a usage limit", async () => {
    const { result, bodies } = run([
      failure(429, "subscription_sharing_usage_limit_exceeded"),
    ]);
    await assert.rejects(result, code("rate_limited"));
    assert.equal(bodies.length, 1);
  });

  it("refreshes once on a 401", async () => {
    let forced = 0;
    const session = fakeSession({
      token: async (force = false) => {
        if (force) forced += 1;
        return force ? "fresh" : "stale";
      },
    });
    const { result, headers } = run([failure(401, "x"), reply("{}")], {
      session,
    });
    await result;
    assert.equal(forced, 1);
    assert.equal(headers[1]?.get("authorization"), "Bearer fresh");
  });

  it("asks people to connect when no sign-in exists", async () => {
    const session = fakeSession({
      token: async () => {
        throw new NotConnectedError("Connect first.");
      },
    });
    const { result } = run([], { session });
    await assert.rejects(result, code("no_key"));
  });

  it("names a cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = (async (_url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return reply("{}");
    }) as typeof fetch;
    await assert.rejects(
      sampleJson({
        messages: [{ role: "user", content: "x" }],
        session: fakeSession(),
        fetcher,
        signal: controller.signal,
      }),
      code("cancelled")
    );
  });
});

describe("listModels", () => {
  it("keeps listed models in the server's order", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          models: [
            { slug: "b", display_name: "B", visibility: "list" },
            { slug: "hidden", display_name: "H", visibility: "hide" },
            { slug: "a", display_name: "A", visibility: "list" },
          ],
        })
      )) as typeof fetch;
    assert.deepEqual(await listModels(fakeSession(), fetcher), [
      { slug: "b", displayName: "B" },
      { slug: "a", displayName: "A" },
    ]);
  });
});

describe("pageCode", () => {
  it("maps plan errors to what the page can word", () => {
    assert.equal(
      pageCode({ code: "subscription_sharing_user_not_eligible" }),
      "no_key"
    );
    assert.equal(
      pageCode({ code: "subscription_sharing_invalid_user" }),
      "session_expired"
    );
    assert.equal(pageCode({}, 500), "upstream_error");
  });
});
