import type { ConfigUpdate } from "./types";

/**
 * Catches keys pasted into the wrong box before anything is saved. These
 * check only the shape of each value; whether a key works is the job of the
 * service checks. Returns a sentence per problem, keyed by field id.
 */

const HEX = /^[0-9a-f]+$/i;

export type KeyProblems = Partial<Record<"assemblyAiKey", string>>;

export function checkKeyFormats(update: ConfigUpdate): KeyProblems {
  const problems: KeyProblems = {};
  const assembly = update.assemblyAiKey?.trim();

  if (assembly) {
    if (assembly.startsWith("sk-"))
      problems.assemblyAiKey =
        "This looks like an OpenAI key. Paste your AssemblyAI key here.";
    else if (!(assembly.length === 32 && HEX.test(assembly)))
      problems.assemblyAiKey =
        "AssemblyAI keys are 32 letters and numbers. Copy it from your AssemblyAI dashboard.";
  }

  return problems;
}
