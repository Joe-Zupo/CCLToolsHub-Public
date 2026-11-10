import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { installSecret } from "./install-secret";

test("creates a long random secret once and then reuses it", async () => {
  const root = await mkdtemp(join(tmpdir(), "member-edition-"));
  try {
    const folder = join(root, "data");
    const first = installSecret(folder);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(installSecret(folder), first);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("two computers get different secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "member-edition-"));
  try {
    assert.notEqual(
      installSecret(join(root, "one")),
      installSecret(join(root, "two"))
    );
  } finally {
    await rm(root, { recursive: true });
  }
});
