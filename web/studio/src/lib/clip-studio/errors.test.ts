import assert from "node:assert/strict";
import { it } from "node:test";

import { AgentError } from "./agent/types";
import { explainFailure } from "./errors";

it("words known failures for the Creator", () => {
  assert.match(
    explainFailure(new Error("Your ChatGPT sign-in has ended."), "find-clips"),
    /Continue with ChatGPT/
  );
  assert.match(
    explainFailure(
      new Error("Output file does not contain any stream"),
      "transcribe"
    ),
    /no audio track/
  );
});

it("keeps technical text off the page", () => {
  assert.equal(
    explainFailure(new Error("ffmpeg exit 1 at C:/secret/path"), "export"),
    "This clip could not be exported. Try again."
  );
});

it("passes through a no-clips explanation", () => {
  assert.equal(
    explainFailure(
      new AgentError("no-clips", "Choose a shorter length."),
      "find-clips"
    ),
    "Choose a shorter length."
  );
});
