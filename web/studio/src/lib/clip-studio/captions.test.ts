import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { captionsAss, videoSize, type CaptionWord } from "./captions";

const words: CaptionWord[] = [
  { start: 10, end: 10.4, text: "one" },
  { start: 10.5, end: 10.9, text: "two" },
  { start: 11, end: 11.4, text: "three" },
  { start: 11.5, end: 11.9, text: "four" },
];
const size = { width: 1080, height: 1920 };
const plain = { font: "clean", highlight: false } as const;
const highlighted = { font: "clean", highlight: true } as const;
const events = (ass: string) =>
  ass.split("\n").filter((line) => line.startsWith("Dialogue:"));

describe("captionsAss", () => {
  it("shows a few words at a time, timed from the clip's start", () => {
    const lines = events(captionsAss(words, 10, 12, plain, size));
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /0:00:00\.00,0:00:01\.40,.*one two three$/);
    assert.match(lines[1]!, /0:00:01\.50,0:00:01\.90,.*four$/);
  });

  it("colours the word being said, one event per word", () => {
    const lines = events(
      captionsAss(words.slice(0, 3), 10, 12, highlighted, size)
    );
    assert.equal(lines.length, 3);
    assert.match(lines[0]!, /\{\\c&H[0-9A-F]+&\}one\{\\r\} two three$/);
    assert.match(lines[1]!, /one \{\\c&H[0-9A-F]+&\}two\{\\r\} three$/);
    assert.match(lines[2]!, /one two \{\\c&H[0-9A-F]+&\}three\{\\r\}$/);
    // Holds until the next word, so the group never flickers off between words.
    assert.match(lines[0]!, /0:00:00\.00,0:00:00\.50,/);
    assert.match(lines[1]!, /0:00:00\.50,0:00:01\.00,/);
  });

  it("names the chosen font and sizes text to the frame", () => {
    const options = { font: "impact", highlight: false } as const;
    const vertical = captionsAss(words, 10, 12, options, size);
    assert.match(vertical, /PlayResX: 1080\nPlayResY: 1920/);
    assert.match(vertical, /Style: Default,Anton,/);
    const wide = captionsAss(words, 10, 12, options, {
      width: 1920,
      height: 1080,
    });
    assert.match(wide, /PlayResX: 1920\nPlayResY: 1080/);
  });

  it("places captions low by default, or where the member chooses", () => {
    // Fields 18 and 21 of the style line: Alignment and MarginV.
    const placed = (position?: "high" | "middle" | "low") => {
      const style = captionsAss(words, 10, 12, { ...plain, position }, size)
        .split("\n")
        .find((line) => line.startsWith("Style: "))!
        .split(",");
      return [style[18], style[21]];
    };
    assert.deepEqual(placed(), ["2", "384"]);
    assert.deepEqual(placed("low"), ["2", "384"]);
    assert.deepEqual(placed("middle"), ["5", "0"]);
    assert.deepEqual(placed("high"), ["8", "230"]);
  });

  it("leaves out words outside the clip and clamps those crossing its edges", () => {
    const lines = events(captionsAss(words, 10.6, 11.2, plain, size));
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /0:00:00\.00,0:00:00\.60,.*two three$/);
  });

  it("starts a new group after a pause and does not hold across it", () => {
    const paused: CaptionWord[] = [
      { start: 0, end: 0.4, text: "before" },
      { start: 3, end: 3.4, text: "after" },
    ];
    assert.equal(events(captionsAss(paused, 0, 5, plain, size)).length, 2);
    const held = events(captionsAss(paused, 0, 5, highlighted, size));
    assert.match(held[0]!, /0:00:00\.00,0:00:00\.40,/);
  });

  it("cannot be steered by text in the transcript", () => {
    const hostile: CaptionWord[] = [
      { start: 0, end: 1, text: "{\\pos(0,0)}hi\\N\nthere" },
    ];
    const [line] = events(captionsAss(hostile, 0, 2, plain, size));
    assert.ok(!line!.includes("{"));
    assert.ok(!line!.includes("\\"));
    assert.equal(events(captionsAss(hostile, 0, 2, plain, size)).length, 1);
  });
});

describe("videoSize", () => {
  it("reads the size from ffmpeg's output", () => {
    assert.deepEqual(
      videoSize(
        "  Stream #0:0(und): Video: h264 (High), yuv420p(tv), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps"
      ),
      { width: 1920, height: 1080 }
    );
  });

  it("swaps the sides of a rotated phone video", () => {
    assert.deepEqual(
      videoSize(
        "Stream #0:0: Video: hevc, yuv420p, 1920x1080, 30 fps\n    Side data:\n      displaymatrix: rotation of -90.00 degrees"
      ),
      { width: 1080, height: 1920 }
    );
  });

  it("falls back to 16:9 when it cannot tell", () => {
    assert.deepEqual(videoSize("nothing useful"), {
      width: 1920,
      height: 1080,
    });
  });
});
