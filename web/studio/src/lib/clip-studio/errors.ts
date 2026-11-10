import { AgentError } from "./agent/types";

/**
 * Turns what providers and ffmpeg report into a sentence the Creator can act
 * on. The technical text belongs in the server log; none of it reaches the page.
 */

export type FailedStep = "transcribe" | "find-clips" | "export";

const KNOWN: [RegExp, string][] = [
  [
    /connect chatgpt|sign-in has ended|plan use isn't turned on/i,
    "ChatGPT needs connecting again. Open Settings and choose Continue with ChatGPT.",
  ],
  [
    /usage limit|rate.?limit|too many requests/i,
    "Your ChatGPT plan has reached its limit for now. Try again later.",
  ],
  [/timed out|timeout/i, "ChatGPT took too long to answer. Try again."],
  [
    /assemblyai rejected/i,
    "AssemblyAI rejected your API key. Check it in Settings.",
  ],
  [
    /assemblyai.*(balance|credit|payment|upgrade)/i,
    "Your AssemblyAI account is out of credit. Add a payment method on its dashboard, then try again.",
  ],
  [
    /no spoken audio|no speech/i,
    "AssemblyAI could not hear any speech in this video.",
  ],
  [
    /does not contain any stream|matches no streams/i,
    "This video has no audio track, so there is nothing to transcribe.",
  ],
  [/enoent|no such file/i, "This video's file is missing. Upload it again."],
];

const FALLBACK: Record<FailedStep, string> = {
  transcribe: "This video could not be transcribed. Try again.",
  "find-clips": "ChatGPT could not find clips this time. Try again.",
  export: "This clip could not be exported. Try again.",
};

export function explainFailure(error: unknown, step: FailedStep): string {
  if (error instanceof AgentError && error.code === "no-clips")
    return error.message;
  const raw = error instanceof Error ? error.message : String(error);
  return KNOWN.find(([pattern]) => pattern.test(raw))?.[1] ?? FALLBACK[step];
}
