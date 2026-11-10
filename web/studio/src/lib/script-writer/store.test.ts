import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { BadPathError, createDocStore, fitList, type DocStore } from "./store";

const alice = { installationId: "inst", sub: "alice" };
const bob = { installationId: "inst", sub: "bob" };
const elsewhere = { installationId: "other", sub: "alice" };

describe("fitList", () => {
  it("keeps everything that fits", () => {
    assert.deepEqual(fitList([{ a: 1 }], 100), {
      docs: [{ a: 1 }],
      truncated: false,
    });
  });

  it("stops before the limit and says so, keeping the first documents", () => {
    const big = { text: "x".repeat(60) };
    assert.deepEqual(fitList([big, big], 100), {
      docs: [big],
      truncated: true,
    });
  });
});

describe("doc store", () => {
  let root: string;
  let store: DocStore;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "script-writer-store-"));
    store = createDocStore(root);
  });
  after(() => rm(root, { recursive: true, force: true }));

  it("lists and removes everything one member has, and nobody else's", async () => {
    const carol = { installationId: "wipe", sub: "carol" };
    const dan = { installationId: "wipe", sub: "dan" };
    await store.set(carol, "data/users/local/s1", { title: "one" });
    await store.set(carol, "settings/keys", { savedKey: "v1.x" });
    await store.set(dan, "data/users/local/s1", { title: "two" });

    assert.deepEqual((await store.paths(carol)).sort(), [
      "data/users/local/s1",
      "settings/keys",
    ]);

    await store.removeAll(carol);
    assert.deepEqual(await store.paths(carol), []);
    assert.deepEqual(await store.paths(dan), ["data/users/local/s1"]);
  });

  it("removes every member of one installation, and no other installation", async () => {
    const gone = { installationId: "gone", sub: "erin" };
    const kept = { installationId: "kept", sub: "erin" };
    await store.set(gone, "data/users/local/s1", { title: "one" });
    await store.set(kept, "data/users/local/s1", { title: "two" });

    await store.removeInstallation("gone");
    assert.deepEqual(await store.paths(gone), []);
    assert.deepEqual(await store.paths(kept), ["data/users/local/s1"]);
  });

  it("returns null for a document that does not exist", async () => {
    assert.equal(await store.get(alice, "data/none"), null);
    assert.deepEqual(await store.list(alice, "data/nothing"), []);
  });

  it("writes, reads and removes a document", async () => {
    await store.set(alice, "data/users/local/s1", { title: "one" });
    assert.deepEqual(await store.get(alice, "data/users/local/s1"), {
      title: "one",
    });
    await store.remove(alice, "data/users/local/s1");
    assert.equal(await store.get(alice, "data/users/local/s1"), null);
  });

  it("leaves no temp files behind", async () => {
    await store.set(alice, "tidy/doc", { a: 1 });
    const dir = join(root, "inst", "alice", "tidy");
    assert.deepEqual(await readdir(dir), ["doc.json"]);
  });

  it("keeps members and installations apart", async () => {
    await store.set(alice, "private/note", { text: "alice" });
    assert.equal(await store.get(bob, "private/note"), null);
    assert.equal(await store.get(elsewhere, "private/note"), null);
    assert.deepEqual(await store.list(bob, "private"), []);
  });

  it("lists only direct documents, newest first, up to the limit", async () => {
    const list = "data/users/local";
    await store.set(alice, `${list}/old`, { updatedAt: 1 });
    await store.set(alice, `${list}/new`, { updatedAt: 3 });
    await store.set(alice, `${list}/mid`, { updatedAt: 2 });
    await store.set(alice, `${list}/profile/teach/all`, { nested: true });
    const docs = await store.list(alice, list, {
      orderBy: "updatedAt",
      limit: 2,
    });
    assert.deepEqual(
      docs.map((doc) => doc.id),
      ["new", "mid"]
    );
  });

  it("refuses paths that could leave the owner's folder", async () => {
    for (const path of [
      "../bob/x",
      "a/../../x",
      "..",
      "",
      "a//b",
      "a\\b",
      ".x",
    ]) {
      await assert.rejects(store.get(alice, path), BadPathError, path);
      await assert.rejects(store.set(alice, path, {}), BadPathError, path);
      await assert.rejects(store.remove(alice, path), BadPathError, path);
      await assert.rejects(store.list(alice, path), BadPathError, path);
    }
  });
});
