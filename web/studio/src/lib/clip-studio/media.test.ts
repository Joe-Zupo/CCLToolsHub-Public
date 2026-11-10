import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.STUDIO_DATA = mkdtempSync(join(tmpdir(), "member-edition-"));

const { isUploadName, mediaLink, mediaPath, newUploadName, withLocalLinks } =
  await import("./media");

test("refuses paths that leave the media folder", () => {
  assert.throws(() => mediaPath("../secret"));
  assert.throws(() => mediaPath("uploads/../../secret"));
  assert.ok(mediaPath("uploads/a.mp4").endsWith(join("uploads", "a.mp4")));
});

test("upload names keep a safe extension and pass their own check", () => {
  const name = newUploadName("my video!.MP4");
  assert.match(name, /^uploads\/[\w-]+\.mp4$/);
  assert.equal(isUploadName(name), true);
  assert.equal(isUploadName("exports/a.mp4"), false);
  assert.equal(isUploadName("uploads/../a.mp4"), false);
});

test("a name with no usable extension still gets one", () => {
  assert.match(newUploadName("video"), /\.mp4$/);
});

test("links go through the files route", () => {
  assert.equal(
    mediaLink("exports/job/a b.mp4"),
    "/api/clip-studio/files/exports/job/a%20b.mp4"
  );
});

test("a job's files become local links, and an empty source stays empty", () => {
  const job = withLocalLinks({
    sourceUrl: "",
    exports: [{ url: "exports/a.mp4" }, { url: null }],
  } as never) as unknown as {
    sourceUrl: string;
    exports: { url: string | null }[];
  };
  assert.equal(job.sourceUrl, "");
  assert.equal(job.exports[0]?.url, "/api/clip-studio/files/exports/a.mp4");
  assert.equal(job.exports[1]?.url, null);
});
