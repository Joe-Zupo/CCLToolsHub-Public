/** Whether a service can run now, and if not, a sentence the user can act on. */
export type Readiness = { ok: true } | { ok: false; message: string };

export type AgentId = "chatgpt";

/**
 * Something that turns a prompt into text. It is ChatGPT on the
 * person's own plan. Clip Studio only ever asks an Agent
 * for text; reading clips out of that text is `clip-agent.ts`'s job, so a new
 * Agent only has to implement these four members.
 */
export interface Agent {
  id: AgentId;
  label: string;
  /** The largest prompt, in tokens, this Agent is asked to read. */
  maxInputTokens: number;
  /** Keyed and able to answer a tiny prompt. May cost a few tokens. */
  ready(): Promise<Readiness>;
  complete(prompt: string, options?: { system?: string }): Promise<string>;
}

export type AgentErrorCode =
  "not-ready" | "failed" | "bad-output" | "timeout" | "no-clips";

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AgentError";
  }
}
