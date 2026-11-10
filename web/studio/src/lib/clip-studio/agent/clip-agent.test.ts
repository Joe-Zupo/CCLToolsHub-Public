import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkBudget,
  findClips,
  planClipEdit,
  type Sentence,
} from "./clip-agent";
import { AgentError, type Agent } from "./types";

/** An agent that answers every prompt with `reply` and records the prompts. */
const scripted = (reply: string, maxInputTokens = 100_000) => {
  const prompts: { prompt: string; system?: string }[] = [];
  const agent: Agent = {
    id: "chatgpt",
    label: "Fake",
    maxInputTokens,
    ready: async () => ({ ok: true }),
    complete: async (prompt, options) => {
      prompts.push({ prompt, system: options?.system });
      return reply;
    },
  };
  return { agent, prompts };
};

// Ten 10-second sentences: 0-10, 10-20, ... 90-100.
const sentences: Sentence[] = Array.from({ length: 10 }, (_, i) => ({
  start: i * 10,
  end: i * 10 + 10,
  text: `Sentence number ${i}.`,
}));

const clip = (start: number, end: number, score = 5, title = "A title") => ({
  start,
  end,
  title,
  hook: "A hook",
  reason: "A reason",
  score,
});

describe("findClips", () => {
  it("shows the agent every sentence with its timestamps and the count", async () => {
    const { agent, prompts } = scripted(
      JSON.stringify({ clips: [clip(0, 30)] })
    );
    await findClips(agent, { sentences, durationSec: 100, count: 5 });
    const prompt = prompts[0]!.prompt;
    assert.match(prompt, /\[30\.0-40\.0\] Sentence number 3\./);
    assert.match(prompt, /5 clips/);
  });

  it("reads JSON wrapped in a code fence and prose", async () => {
    const { agent } = scripted(
      "Here you go:\n```json\n" +
        JSON.stringify({ clips: [clip(0, 30)] }) +
        "\n```\nHope that helps."
    );
    const clips = await findClips(agent, { sentences, durationSec: 100 });
    assert.equal(clips.length, 1);
    assert.equal(clips[0]!.title, "A title");
    assert.ok(clips[0]!.id);
  });

  it("snaps clips to sentence boundaries and keeps them inside the video", async () => {
    const { agent } = scripted(
      JSON.stringify({ clips: [clip(12.5, 38.2), clip(75, 140)] })
    );
    const clips = await findClips(agent, { sentences, durationSec: 100 });
    const bounds = clips.map(({ start, end }) => [start, end]);
    assert.deepEqual(bounds, [
      [10, 40],
      [70, 100],
    ]);
  });

  it("drops clips that are malformed, inverted or too short", async () => {
    const { agent } = scripted(
      JSON.stringify({
        clips: [
          clip(50, 40),
          { start: "soon", end: 20, title: "x" },
          clip(0, 3),
          clip(20, 50),
        ],
      })
    );
    const clips = await findClips(agent, {
      sentences,
      durationSec: 100,
      minSec: 15,
    });
    assert.deepEqual(
      clips.map(({ start, end }) => [start, end]),
      [[20, 50]]
    );
  });

  it("keeps the better of two overlapping clips", async () => {
    const { agent } = scripted(
      JSON.stringify({
        clips: [clip(0, 30, 4, "weak"), clip(10, 40, 9, "strong")],
      })
    );
    const clips = await findClips(agent, { sentences, durationSec: 100 });
    assert.deepEqual(
      clips.map(({ title }) => title),
      ["strong"]
    );
  });

  it("returns at most `count` clips, best first by score, in video order", async () => {
    const { agent } = scripted(
      JSON.stringify({
        clips: [
          clip(0, 20, 1, "a"),
          clip(20, 40, 9, "b"),
          clip(40, 60, 3, "c"),
          clip(60, 80, 8, "d"),
        ],
      })
    );
    const clips = await findClips(agent, {
      sentences,
      durationSec: 100,
      count: 2,
    });
    assert.deepEqual(
      clips.map(({ title }) => title),
      ["b", "d"]
    );
  });

  it("throws when the agent gives nothing usable", async () => {
    const { agent } = scripted("I could not find anything.");
    await assert.rejects(
      findClips(agent, { sentences, durationSec: 100 }),
      (error) => error instanceof AgentError && error.code === "no-clips"
    );
  });
});

describe("planClipEdit", () => {
  const candidate = {
    id: "c1",
    ...clip(20, 50),
  };

  it("shows the agent the clip's transcript and returns its edit", async () => {
    const { agent, prompts } = scripted(
      JSON.stringify({
        start: 21,
        end: 48,
        title: "Sharper title",
        caption: "Watch this #shorts",
      })
    );
    const edit = await planClipEdit(agent, {
      candidate,
      sentences,
      durationSec: 100,
    });
    assert.match(prompts[0]!.prompt, /Sentence number 2\./);
    assert.doesNotMatch(prompts[0]!.prompt, /Sentence number 9\./);
    assert.deepEqual(edit, {
      start: 20,
      end: 50,
      title: "Sharper title",
      caption: "Watch this #shorts",
    });
  });

  it("keeps the agent's cut near the picked clip", async () => {
    const { agent } = scripted(
      JSON.stringify({ start: 0, end: 100, title: "t", caption: "c" })
    );
    const edit = await planClipEdit(agent, {
      candidate,
      sentences,
      durationSec: 100,
    });
    assert.ok(edit.start >= candidate.start - 15);
    assert.ok(edit.end <= candidate.end + 15);
  });

  it("falls back to the picked clip when the agent's answer is unusable", async () => {
    const { agent } = scripted("no json here");
    const edit = await planClipEdit(agent, {
      candidate,
      sentences,
      durationSec: 100,
    });
    assert.deepEqual(edit, {
      start: 20,
      end: 50,
      title: "A title",
      caption: "A hook",
    });
  });
});

describe("checkBudget", () => {
  it("passes a prompt that fits the agent's input limit", () => {
    const { agent } = scripted("", 1000);
    assert.deepEqual(checkBudget(agent, "x".repeat(400)), { ok: true });
  });

  it("refuses a prompt larger than the agent's input limit", () => {
    const { agent } = scripted("", 1000);
    const result = checkBudget(agent, "x".repeat(10_000));
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.message : "", /too long/i);
  });
});
