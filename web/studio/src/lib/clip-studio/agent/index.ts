import { createChatGptAgent } from "./chatgpt";
import type { Agent } from "./types";

export { AgentError, type Agent } from "./types";

/** ChatGPT on the person's own plan, the same connection Script Writer uses. */
export const agentFor = (): Agent => createChatGptAgent();
