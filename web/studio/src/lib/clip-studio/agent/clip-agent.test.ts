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
      minSec: 5,
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

describe("when no clip comes out", () => {
  const failure = async (reply: string, given: Sentence[] = sentences) => {
    const { agent, prompts } = scripted(reply);
    const error = await findClips(agent, {
      sentences: given,
      durationSec: 100,
      minSec: 30,
      maxSec: 45,
    }).then(
      () => assert.fail("expected no clips"),
      (caught: AgentError) => caught
    );
    assert.equal(error.code, "no-clips");
    return { error, prompts };
  };

  it("says none fit the length, without the agent's raw answer", async () => {
    const { error } = await failure(
      JSON.stringify({ clips: [clip(0, 3), clip(40, 41)] })
    );
    assert.match(error.message, /2 clips/);
    assert.match(error.message, /30 sec to 45 sec/);
    assert.ok(!error.message.includes("{"));
    assert.ok(error.detail?.includes('"clips"'));
  });

  it("says when the agent found nothing worth clipping", async () => {
    const { error } = await failure(JSON.stringify({ clips: [] }));
    assert.match(error.message, /found no strong moments/);
    assert.ok(!error.message.includes("{"));
  });

  it("says when the answer could not be read", async () => {
    const { error } = await failure("I could not find anything.");
    assert.match(error.message, /Try again/);
    assert.ok(!error.message.includes("could not find anything"));
    assert.equal(error.detail, "I could not find anything.");
  });

  it("does not ask the agent about a video with no speech", async () => {
    const { error, prompts } = await failure("{}", []);
    assert.match(error.message, /no speech/i);
    assert.equal(prompts.length, 0);
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

describe("clip length", () => {
  // 40 ten-second sentences: 0-10 ... 390-400.
  const long: Sentence[] = Array.from({ length: 40 }, (_, i) => ({
    start: i * 10,
    end: i * 10 + 10,
    text: `Sentence number ${i}.`,
  }));

  it("tells the agent the chosen length", async () => {
    const { agent, prompts } = scripted(
      JSON.stringify({ clips: [clip(0, 60)] })
    );
    await findClips(agent, {
      sentences: long,
      durationSec: 400,
      minSec: 45,
      maxSec: 120,
    });
    assert.match(prompts[0]!.prompt, /45-120 seconds/);
  });

  it("drops clips under the minimum", async () => {
    const { agent } = scripted(
      JSON.stringify({ clips: [clip(0, 10), clip(100, 160, 9, "Long enough")] })
    );
    const clips = await findClips(agent, {
      sentences: long,
      durationSec: 400,
      minSec: 30,
      maxSec: 90,
    });
    assert.deepEqual(
      clips.map((c) => c.title),
      ["Long enough"]
    );
  });

  it("grows a slightly short clip by whole neighbouring sentences", async () => {
    const { agent } = scripted(JSON.stringify({ clips: [clip(0, 20)] }));
    const [only] = await findClips(agent, {
      sentences: long,
      durationSec: 400,
      minSec: 30,
      maxSec: 45,
    });
    assert.deepEqual([only!.start, only!.end], [0, 30]);
  });

  it("grows backwards when the video has no sentences left after the clip", async () => {
    const { agent } = scripted(JSON.stringify({ clips: [clip(380, 400)] }));
    const [only] = await findClips(agent, {
      sentences: long,
      durationSec: 400,
      minSec: 30,
      maxSec: 45,
    });
    assert.deepEqual([only!.start, only!.end], [370, 400]);
  });

  it("keeps a clip just under the minimum when no sentence fits to grow it", async () => {
    // The clip this came from: 29.8 seconds against a 30-second minimum.
    const tight: Sentence[] = [
      { start: 241.4, end: 271.2, text: "What's my dream in life?" },
      { start: 271.2, end: 340, text: "A long answer." },
    ];
    const { agent } = scripted(JSON.stringify({ clips: [clip(241.4, 271.2)] }));
    const [only] = await findClips(agent, {
      sentences: tight,
      durationSec: 340,
      minSec: 30,
      maxSec: 45,
    });
    assert.deepEqual([only!.start, only!.end], [241.4, 271.2]);
  });

  it("keeps a clip just over the maximum when trimming would ruin it", async () => {
    const tight: Sentence[] = [{ start: 0, end: 46.5, text: "One long take." }];
    const { agent } = scripted(JSON.stringify({ clips: [clip(0, 46.5)] }));
    const [only] = await findClips(agent, {
      sentences: tight,
      durationSec: 46.5,
      minSec: 30,
      maxSec: 45,
    });
    assert.equal(only!.end, 46.5);
  });

  it("trims a clip over the maximum back to a sentence end", async () => {
    const { agent } = scripted(JSON.stringify({ clips: [clip(0, 300)] }));
    const [only] = await findClips(agent, {
      sentences: long,
      durationSec: 400,
      minSec: 30,
      maxSec: 95,
    });
    assert.equal(only!.start, 0);
    assert.equal(only!.end, 90);
  });

  it("drops an over-long clip when trimming would leave too little", async () => {
    // One 200-second sentence: no sentence end falls inside the maximum.
    const sparse: Sentence[] = [
      { start: 0, end: 200, text: "A very long sentence." },
      { start: 200, end: 260, text: "A shorter one." },
    ];
    const { agent } = scripted(
      JSON.stringify({ clips: [clip(0, 200), clip(200, 260, 5, "Fits")] })
    );
    const clips = await findClips(agent, {
      sentences: sparse,
      durationSec: 260,
      minSec: 30,
      maxSec: 180,
    });
    assert.deepEqual(
      clips.map((c) => c.title),
      ["Fits"]
    );
  });

  it("says so without asking the agent when the video is too short", async () => {
    const { agent, prompts } = scripted("{}");
    await assert.rejects(
      findClips(agent, { sentences, durationSec: 20, minSec: 30, maxSec: 90 }),
      (error: AgentError) =>
        error.code === "no-clips" && /shorter than/.test(error.message)
    );
    assert.equal(prompts.length, 0);
  });

  it("keeps an edit inside the chosen length", async () => {
    const pick = {
      id: "a",
      start: 100,
      end: 160,
      title: "T",
      hook: "H",
      reason: "R",
      score: 5,
    };
    const tooShort = scripted(
      JSON.stringify({ start: 110, end: 120, title: "New", caption: "Cap" })
    );
    const short = await planClipEdit(tooShort.agent, {
      candidate: pick,
      sentences: long,
      durationSec: 400,
      minSec: 30,
      maxSec: 180,
    });
    assert.deepEqual([short.start, short.end], [100, 160]);
    assert.equal(short.title, "T");

    const tooLong = scripted(
      JSON.stringify({ start: 90, end: 170, title: "New", caption: "Cap" })
    );
    const trimmed = await planClipEdit(tooLong.agent, {
      candidate: pick,
      sentences: long,
      durationSec: 400,
      minSec: 30,
      maxSec: 60,
    });
    assert.ok(trimmed.end - trimmed.start <= 60);
    assert.match(tooLong.prompts[0]!.prompt, /30-60 seconds/);
  });
});
