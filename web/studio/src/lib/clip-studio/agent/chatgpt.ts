import {
  sampleJson,
  SampleError,
  type SampleMessage,
} from "@/lib/chatgpt/responses";
import { chatGptSession, type ChatGptStatus } from "@/lib/chatgpt/session";

import { AgentError, type Agent } from "./types";

type Sample = typeof sampleJson;

/**
 * ChatGPT on the person's own plan, as an Agent. It answers in JSON, and
 * `clip-agent.ts` reads JSON out of the text it gets back.
 */
export function createChatGptAgent({
  sample = sampleJson,
  status = () => chatGptSession().status(),
}: { sample?: Sample; status?: () => Promise<ChatGptStatus> } = {}): Agent {
  return {
    id: "chatgpt",
    label: "ChatGPT",
    maxInputTokens: 180_000,
    async ready() {
      const { signedIn, planEnabled } = await status();
      if (!signedIn)
        return {
          ok: false,
          message: "Open Settings and choose Continue with ChatGPT.",
        };
      if (!planEnabled)
        return {
          ok: false,
          message: "Turn on ChatGPT plan use in Settings to continue.",
        };
      return { ok: true };
    },
    async complete(prompt, options) {
      const messages: SampleMessage[] = options?.system
        ? [
            { role: "user", content: options.system },
            { role: "user", content: prompt },
          ]
        : [{ role: "user", content: prompt }];
      try {
        return JSON.stringify(await sample({ messages }));
      } catch (error) {
        throw new AgentError(
          error instanceof SampleError && error.code === "invalid_json"
            ? "bad-output"
            : "failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  };
}
