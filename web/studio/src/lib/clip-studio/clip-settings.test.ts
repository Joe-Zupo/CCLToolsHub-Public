import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readClipSettings } from "./clip-settings";

const job = { clipCount: 5, clipMinSec: 30, clipMaxSec: 90 };

describe("readClipSettings", () => {
  it("takes the member's choices, and the job's for anything left out", () => {
    assert.deepEqual(readClipSettings({ clipCount: 2, maxSec: 180 }, job), {
      clipCount: 2,
      minSec: 30,
      maxSec: 180,
    });
  });

  it("allows the widest and the tightest range", () => {
    assert.ok(readClipSettings({ minSec: 30, maxSec: 180 }, job));
    assert.ok(readClipSettings({ minSec: 30, maxSec: 45 }, job));
  });

  it("refuses a range too tight for a cut to land on a sentence end", () => {
    assert.equal(readClipSettings({ minSec: 30, maxSec: 30 }, job), null);
    assert.equal(readClipSettings({ minSec: 30, maxSec: 44 }, job), null);
  });

  it("refuses anything outside the limits", () => {
    for (const body of [
      { clipCount: 0 },
      { clipCount: 6 },
      { minSec: 29 },
      { maxSec: 181 },
      { minSec: 90, maxSec: 60 },
    ])
      assert.equal(readClipSettings(body, job), null, JSON.stringify(body));
  });
});
