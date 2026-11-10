import { requestTimeout, RESOURCE, type Fetcher } from "./oauth";
import { chatGptSession, type ChatGptSession } from "./session";

/**
 * Model calls on the person's own ChatGPT plan. Every request is a streamed
 * POST to /v1/responses with `store: false`, and each carries its whole history.
 */

export type SampleMessage = { role: "user" | "assistant"; content: string };
export type SampleImage = { mediaType: string; data: string };
export type Model = { slug: string; displayName: string };

export type SampleRequest = {
  messages: SampleMessage[];
  images?: SampleImage[];
  modelTier?: string;
  effort?: string;
  signal?: AbortSignal;
  session?: ChatGptSession;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

/** `code` is one the page's `errCopy` knows how to word. */
export class SampleError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "SampleError";
  }
}

const TIMEOUT_MS = 10 * 60_000;
const RETRY_DELAYS_MS = [1000, 3000];
const MODELS_TTL_MS = 10 * 60_000;

const JSON_ONLY =
  "\n\nReply with one JSON object only. No code fences, and no text before or after it.";

type InputItem = { role: "user" | "assistant"; content: unknown };

/**
 * The page sends its rules as the first message whenever there is more than
 * one, so those become the instructions. Images go with the last user turn.
 */
export function buildRequest(
  messages: SampleMessage[],
  images: SampleImage[] = []
): { instructions: string; input: InputItem[] } {
  const [first, ...rest] = messages;
  if (!first) throw new SampleError("empty_completion", "Nothing to send.");
  const instructions = rest.length
    ? first.content + JSON_ONLY
    : JSON_ONLY.trim();
  const turns = rest.length ? rest : [first];
  const lastUser = turns.map((turn) => turn.role).lastIndexOf("user");
  return {
    instructions,
    input: turns.map((turn, index) => ({
      role: turn.role,
      content:
        index === lastUser && images.length
          ? [
              { type: "input_text", text: turn.content },
              ...images.map((image) => ({
                type: "input_image",
                image_url: `data:${image.mediaType};base64,${image.data}`,
              })),
            ]
          : turn.content,
    })),
  };
}

/** The reply as JSON, allowing for code fences or stray words around it. */
export function parseReply(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new SampleError("empty_completion", "Empty reply.");
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)?.[1];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidates = [
    trimmed,
    fenced,
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next reading.
    }
  }
  throw new SampleError("invalid_json", "The reply was not JSON.");
}

type ApiError = { code?: string; param?: string; message?: string };

/** Maps OpenAI's error codes to the ones the page words for people. */
export function pageCode(error: ApiError, status?: number): string {
  switch (error.code) {
    case "subscription_sharing_usage_limit_exceeded":
      return "rate_limited";
    case "subscription_sharing_invalid_user":
      return "session_expired";
    case "subscription_sharing_user_not_eligible":
    case "chatpass_v2_scope_not_authorized":
    case "chatpass_v2_invalid_authorization_context":
      return "no_key";
    case "context_length_exceeded":
      return "prompt_too_large";
    default:
      if (status === 401) return "session_expired";
      if (status === 429) return "rate_limited";
      return "upstream_error";
  }
}

const describe = (error: ApiError) =>
  error.message ?? error.code ?? "ChatGPT reported an error.";

const passing = (status: number, code?: string) =>
  status === 503 ||
  code === "subscription_sharing_usage_unavailable" ||
  code === "subscription_sharing_user_unavailable";

const readError = async (response: Response): Promise<ApiError> => {
  const body = (await response.json().catch(() => null)) as {
    error?: ApiError;
    detail?: string;
  } | null;
  return body?.error ?? { message: body?.detail };
};

type StreamEvent = {
  type?: string;
  delta?: string;
  code?: string;
  message?: string;
  response?: { error?: ApiError | null };
};

/** Each `data:` block of a server-sent event stream, parsed. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = body
    .pipeThrough(
      new TextDecoderStream() as unknown as ReadableWritablePair<
        string,
        Uint8Array
      >
    )
    .getReader();
  let buffer = "";
  const parse = (block: string): StreamEvent | null => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return null;
    try {
      return JSON.parse(data) as StreamEvent;
    } catch {
      return null;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parse(block);
      if (event) yield event;
    }
  }
  const last = parse(buffer);
  if (last) yield last;
}

async function collectText(body: ReadableStream<Uint8Array>): Promise<string> {
  let text = "";
  for await (const event of readEvents(body)) {
    if (event.type === "response.output_text.delta") text += event.delta ?? "";
    else if (event.type === "response.completed") return text;
    else if (event.type === "response.failed") {
      const error = event.response?.error ?? {};
      throw new SampleError(pageCode(error), describe(error));
    } else if (event.type === "error") {
      const error = { code: event.code, message: event.message };
      throw new SampleError(pageCode(error), describe(error));
    } else if (event.type === "response.incomplete")
      throw new SampleError("prompt_too_large", "The reply was cut short.");
  }
  throw new SampleError("upstream_error", "The reply stopped early.");
}

const modelCache = new WeakMap<
  ChatGptSession,
  { token: string; at: number; models: Model[] }
>();

/** The models this account may use, in OpenAI's order. */
export async function listModels(
  session: ChatGptSession = chatGptSession(),
  fetcher: Fetcher = fetch
): Promise<Model[]> {
  const token = await session.token();
  const cached = modelCache.get(session);
  if (cached?.token === token && Date.now() - cached.at < MODELS_TTL_MS)
    return cached.models;
  const response = await fetcher(`${RESOURCE}/models`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: requestTimeout(),
  });
  if (!response.ok) {
    const error = await readError(response);
    throw new SampleError(pageCode(error, response.status), describe(error));
  }
  const { models = [] } = (await response.json()) as {
    models?: { slug: string; display_name: string; visibility?: string }[];
  };
  const listed = models
    .filter((model) => model.visibility === "list")
    .map(({ slug, display_name }) => ({ slug, displayName: display_name }));
  modelCache.set(session, { token, at: Date.now(), models: listed });
  return listed;
}

/** The saved model, unless OpenAI no longer lists it for this account. */
async function pickModel(session: ChatGptSession, fetcher: Fetcher) {
  const saved = (await session.status()).model;
  if (!saved) return (await listModels(session, fetcher))[0]?.slug;
  const listed = await listModels(session, fetcher).catch(() => []);
  return !listed.length || listed.some(({ slug }) => slug === saved)
    ? saved
    : listed[0]?.slug;
}

export async function sampleJson({
  messages,
  images = [],
  modelTier,
  effort,
  signal,
  session = chatGptSession(),
  fetcher = fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  timeoutMs = TIMEOUT_MS,
}: SampleRequest): Promise<unknown> {
  const { instructions, input } = buildRequest(messages, images);
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const reasoning = effort ?? (modelTier === "complex" ? "high" : undefined);

  try {
    const model = await pickModel(session, fetcher);
    if (!model)
      throw new SampleError("no_key", "This account has no models to use.");

    let token = await session.token();
    let useReasoning = Boolean(reasoning);
    let refreshed = false;

    for (let retries = 0; ;) {
      const response = await fetcher(`${RESOURCE}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions,
          input,
          store: false,
          stream: true,
          ...(useReasoning ? { reasoning: { effort: reasoning } } : {}),
        }),
        signal: combined,
      });
      if (response.ok && response.body)
        return parseReply(await collectText(response.body));

      const error = await readError(response);
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        token = await session.token(true);
        continue;
      }
      if (
        error.code === "subscription_sharing_unsupported_capability" &&
        error.param?.startsWith("reasoning") &&
        useReasoning
      ) {
        useReasoning = false;
        continue;
      }
      if (passing(response.status, error.code) && retries < 2) {
        await sleep(RETRY_DELAYS_MS[retries] ?? 3000);
        retries += 1;
        continue;
      }
      throw new SampleError(pageCode(error, response.status), describe(error));
    }
  } catch (error) {
    if (error instanceof SampleError) throw error;
    // By name: the shared session may come from another route's bundle.
    if (error instanceof Error && error.name === "NotConnectedError")
      throw new SampleError("no_key", error.message);
    if (signal?.aborted) throw new SampleError("cancelled", "Cancelled.");
    if (timeout.aborted)
      throw new SampleError("upstream_error", "ChatGPT timed out.");
    throw new SampleError("upstream_error", "Couldn't reach ChatGPT.");
  }
}
