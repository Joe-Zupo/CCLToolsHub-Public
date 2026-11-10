import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { ClipStore, Owner } from "./store-core";

// crypto.ts reads this when it is first imported.
process.env.STUDIO_DATA = mkdtempSync(join(tmpdir(), "member-edition-"));

const alice: Owner = { installationId: "inst_a", sub: "member_alice" };
const bob: Owner = { installationId: "inst_a", sub: "member_bob" };
// Same member id in another community: a different person.
const aliceElsewhere: Owner = { installationId: "inst_b", sub: "member_alice" };

let store: ClipStore;
let client: PGlite;

before(async () => {
  const schema = await import("@/db/schema");
  const { createClipStore } = await import("./store-core");
  client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  store = createClipStore(db);
});

const newJob = (owner: Owner, name: string) =>
  store.createJob(owner, {
    fileName: name,
    sourceUrl: `https://blob.example/${owner.sub}/${name}`,
    durationSec: 120,
  });

describe("each member's Clip Studio data is their own", () => {
  it("keeps keys and settings per member, encrypted at rest", async () => {
    await store.updateConfig(alice, {
      displayName: "Alice",
      assemblyAiKey: "aai-alice",
    });
    await store.updateConfig(bob, { assemblyAiKey: "aai-bob" });

    const a = await store.readConfig(alice);
    const b = await store.readConfig(bob);
    assert.equal(a.assemblyAiKey, "aai-alice");
    assert.equal(b.assemblyAiKey, "aai-bob");
    assert.equal(b.displayName, "");
    assert.equal((await store.readConfig(aliceElsewhere)).assemblyAiKey, "");

    const raw = await client.query<Record<string, string>>(
      "select * from clip_studio_configs"
    );
    const dump = JSON.stringify(raw.rows);
    assert.doesNotMatch(dump, /aai-alice|aai-bob|aai-alice/);
  });

  it("lists only the member's own videos", async () => {
    const mine = await newJob(alice, "alice.mp4");
    await newJob(bob, "bob.mp4");
    await newJob(aliceElsewhere, "other-community.mp4");

    const listed = await store.listJobs(alice);
    assert.deepEqual(
      listed.map((j) => j.fileName),
      ["alice.mp4"]
    );
    assert.equal(listed[0]!.id, mine.id);
  });

  it("refuses to read, change or delete another member's video", async () => {
    const job = await newJob(alice, "private.mp4");

    assert.equal(await store.readJob(bob, job.id), null);
    assert.equal(await store.readJobRow(aliceElsewhere, job.id), null);
    assert.equal(
      await store.updateJob(bob, job.id, { status: "failed" }),
      false
    );
    assert.deepEqual(await store.deleteJob(bob, job.id), []);

    const still = await store.readJob(alice, job.id);
    assert.equal(still?.status, "uploaded");
  });

  it("refuses to create or read clips on another member's video", async () => {
    const job = await newJob(alice, "clips.mp4");
    assert.equal(
      await store.upsertExport(alice, job.id, "c1", "vertical", {
        status: "done",
        url: "https://blob.example/alice-clip.mp4",
      }),
      true
    );

    assert.equal(
      await store.upsertExport(bob, job.id, "c1", "vertical", {
        status: "failed",
      }),
      false
    );
    assert.equal(await store.exportUrl(bob, job.id, "c1", "vertical"), null);
    assert.equal(
      await store.exportUrl(alice, job.id, "c1", "vertical"),
      "https://blob.example/alice-clip.mp4"
    );
    assert.equal(
      (await store.readJob(alice, job.id))?.exports[0]?.status,
      "done"
    );
  });

  it("deletes everything of one member and nothing of another", async () => {
    const carol: Owner = { installationId: "inst_c", sub: "member_carol" };
    const dave: Owner = { installationId: "inst_c", sub: "member_dave" };
    for (const owner of [carol, dave]) {
      await store.updateConfig(owner, {
        assemblyAiKey: "sk-ant-x",
      });
      const job = await newJob(owner, `${owner.sub}.mp4`);
      await store.upsertExport(owner, job.id, "c1", "vertical", {
        status: "done",
        url: `https://blob.example/${owner.sub}-clip.mp4`,
      });
    }

    const urls = await store.deleteOwnerData(carol);
    assert.deepEqual(urls.sort(), [
      "https://blob.example/member_carol-clip.mp4",
      "https://blob.example/member_carol/member_carol.mp4",
    ]);
    assert.deepEqual(await store.listJobs(carol), []);
    assert.equal((await store.readConfig(carol)).assemblyAiKey, "");

    assert.equal((await store.listJobs(dave)).length, 1);
    assert.equal((await store.readConfig(dave)).assemblyAiKey, "sk-ant-x");
  });
});
