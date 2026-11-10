import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { retentionStartSec, splitScreenFilter } from "./split-screen";

describe("splitScreenFilter", () => {
  it("stacks the clip over the retention video in a full vertical frame", () => {
    const graph = splitScreenFilter(false);
    assert.match(graph, /^\[0:v\].*scale=1080:960.*\[top\];/);
    assert.match(graph, /\[1:v\].*scale=1080:960.*\[bottom\];/);
    assert.match(graph, /\[top\]\[bottom\]vstack=inputs=2/);
    assert.match(graph, /\[out\]$/);
    assert.ok(!graph.includes("subtitles"));
  });

  it("burns captions over the whole frame, after stacking", () => {
    const graph = splitScreenFilter(true);
    assert.ok(
      graph.indexOf("vstack") < graph.indexOf("subtitles=captions.ass")
    );
  });
});

describe("retentionStartSec", () => {
  it("starts each clip somewhere different in the retention video", () => {
    assert.notEqual(retentionStartSec(10, 600), retentionStartSec(100, 600));
  });

  it("always starts inside the retention video", () => {
    assert.equal(retentionStartSec(700, 600), 100);
    assert.equal(retentionStartSec(5, 0), 0);
  });
});
