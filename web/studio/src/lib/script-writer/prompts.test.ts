import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { expandPrompts, RULES_SIZE } from "./prompts";

describe("prompt content", () => {
  const all = ["rules", "mof", "lesson", "analytics"]
    .map((key) => expandPrompts(`{{prompt:${key}}}`))
    .join("\n");

  it("says the agents are AI and gives them no human backstory", () => {
    assert.match(
      expandPrompts("{{prompt:rules}}"),
      /You are an AI script coach/
    );
    assert.match(
      expandPrompts("{{prompt:mof}}"),
      /You are an AI content coach/
    );
    assert.doesNotMatch(all, /22-year-old|mid-20s|who's been there/);
  });

  it("points scripts at the member's own offer, never the maintainers", () => {
    assert.doesNotMatch(all, /\bCCL\b|Content Creator Lab/);
    assert.match(expandPrompts("{{prompt:mof}}"), /the creator's own offer/);
  });

  it("ships a neutral example with no religion in it", () => {
    assert.doesNotMatch(all, /\b(faith|God|Christian)/);
  });

  it("holds the income rule in the rules every room uses", () => {
    assert.match(expandPrompts("{{prompt:rules}}"), /Never promise or imply/);
  });
});

describe("the page", () => {
  const page = readFileSync(
    new URL("../../room/index.html", import.meta.url),
    "utf8"
  );

  it("ships a neutral example with no religion in it", () => {
    assert.doesNotMatch(page, /\b(faith|God\b|Christian)/i);
  });

  it("never tells a persona it is a real person", () => {
    assert.doesNotMatch(page, /real person, not an AI/);
  });

  it("says the agents are AI and names the privacy contact", () => {
    assert.match(page, /Thirdy and Fel are AI, not people/);
    assert.match(page, /help@contentcreatorlab.cc/);
  });
});

describe("expandPrompts", () => {
  it("expands every marker the page uses", () => {
    for (const key of ["rules", "mof", "lesson", "analytics"])
      assert.ok(expandPrompts(`{{prompt:${key}}}`).length > 100, key);
    assert.equal(expandPrompts("{{prompt:rules}}").length, RULES_SIZE);
  });

  it("leaves other text and unknown markers alone", () => {
    assert.equal(expandPrompts("a {{prompt:nope}} b"), "a {{prompt:nope}} b");
    assert.equal(expandPrompts("{{prompt:toString}}"), "{{prompt:toString}}");
  });

  it("keeps the rules out of the page", () => {
    const page = readFileSync("src/room/index.html", "utf8");
    assert.ok(page.includes('const RULES = "{{prompt:rules}}";'));
    assert.ok(!page.includes(expandPrompts("{{prompt:rules}}").slice(0, 80)));
  });
});
