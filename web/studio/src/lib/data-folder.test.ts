import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { folderSize, formatBytes } from "./data-folder";

test("adds up files in nested folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "member-edition-"));
  try {
    await mkdir(join(root, "videos"));
    await writeFile(join(root, "a.json"), "12345");
    await writeFile(join(root, "videos", "b.mp4"), "123");
    assert.equal(await folderSize(root), 8);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("counts a missing folder as empty", async () => {
  assert.equal(await folderSize(join(tmpdir(), "no-such-folder-xyz")), 0);
});

test("formats sizes", () => {
  assert.equal(formatBytes(0), "0 MB");
  assert.equal(formatBytes(1_572_864), "1.5 MB");
  assert.equal(formatBytes(2_147_483_648), "2.0 GB");
});
