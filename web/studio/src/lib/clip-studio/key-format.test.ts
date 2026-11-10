import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkKeyFormats } from "./key-format";

const hex = (length: number) => "a1".repeat(length).slice(0, length);

describe("checkKeyFormats", () => {
  it("passes well-formed keys and empty fields", () => {
    assert.deepEqual(
      checkKeyFormats({
        assemblyAiKey: hex(32),
      }),
      {}
    );
    assert.deepEqual(checkKeyFormats({ assemblyAiKey: "" }), {});
  });

  it("spots another service's key in the AssemblyAI box", () => {
    assert.match(
      checkKeyFormats({ assemblyAiKey: "sk-ant-api03-abc" }).assemblyAiKey ??
        "",
      /OpenAI/
    );
  });
});
