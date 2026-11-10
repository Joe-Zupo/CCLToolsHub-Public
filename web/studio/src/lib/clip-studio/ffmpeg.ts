import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegStatic from "ffmpeg-static";

import type { Word } from "./assemblyai";
import { captionsAss, videoSize } from "./captions";
import { env } from "./env";
import { retentionStartSec, splitScreenFilter } from "./split-screen";
import type { CaptionOptions, ExportFormat } from "./types";

/**
 * ffmpeg renders the finished clips. It is the static build from
 * `ffmpeg-static`, so the Creator needs no system install.
 */

const ffmpeg = () => env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";

/** The caption fonts ship in the repo, so every computer renders captions the same. */
const fontsDir = () => join(process.cwd(), "assets", "fonts");

type Ran = { code: number | null; stderr: string };

const run = (
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    onStdout?: (text: string) => void;
  }
) =>
  new Promise<Ran>((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ ffmpeg(), args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
    });
    let stderr = "";
    child.stdout.on("data", (data: Buffer) =>
      options.onStdout?.(data.toString("utf8"))
    );
    child.stderr.on("data", (data: Buffer) => {
      // Keep the tail only: ffmpeg is chatty on long renders.
      stderr = (stderr + data.toString("utf8")).slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });

/** Progress lines from `-progress pipe:1`, as a fraction of `durationSec`. */
const progressReader = (
  durationSec: number,
  onFraction: (fraction: number) => void
) => {
  let last = -1;
  return (text: string) => {
    const match = /out_time_us=(\d+)/g;
    let found: RegExpExecArray | null;
    while ((found = match.exec(text))) {
      const fraction = Math.min(1, Number(found[1]) / 1e6 / durationSec);
      // Report every 10%, to keep database writes down.
      if (Math.floor(fraction * 10) > last) {
        last = Math.floor(fraction * 10);
        onFraction(fraction);
      }
    }
  };
};

/**
 * Renders one clip, with captions burned in if chosen, and calls `withFile` with the
 * finished MP4's path, before the temporary folder is removed. ffmpeg runs
 * inside that folder and reads the captions and font config by bare names,
 * because drive paths inside a filter graph need escaping that breaks easily.
 */
export async function renderClip<T>(
  options: {
    sourceUrl: string;
    start: number;
    end: number;
    words: Word[];
    format: ExportFormat;
    captions: CaptionOptions;
    /** A video to loop, muted, under the clip. Vertical format only. */
    retention?: { sourceUrl: string; durationSec: number } | null;
    onFraction: (fraction: number) => void;
  },
  withFile: (path: string) => Promise<T>
): Promise<T> {
  const { sourceUrl, start, end, words, format, captions } = options;
  const retention = format === "vertical" ? options.retention : null;
  const dir = await mkdtemp(join(tmpdir(), "clip-studio-"));
  try {
    const filters =
      format === "vertical"
        ? [
            "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'",
            "scale=1080:1920",
            "setsar=1",
          ]
        : [];
    if (captions.enabled) {
      // Text is sized to the frame it lands on, so an upright phone video in
      // its original frame gets the same proportions as a landscape one.
      const size =
        format === "vertical"
          ? { width: 1080, height: 1920 }
          : videoSize(
              (await run(["-hide_banner", "-i", sourceUrl], { cwd: dir }))
                .stderr
            );
      await writeFile(
        join(dir, "captions.ass"),
        captionsAss(words, start, end, captions, size)
      );
      // A font config of our own, since the computer may have none.
      await writeFile(
        join(dir, "fonts.conf"),
        `<?xml version="1.0"?><fontconfig><dir>${fontsDir()}</dir><cachedir>${join(dir, "fontcache")}</cachedir></fontconfig>`
      );
      // `fontsdir` is relative to the folder ffmpeg runs in.
      await cp(fontsDir(), join(dir, "fonts"), { recursive: true });
      filters.push("subtitles=captions.ass:fontsdir=fonts");
    }
    const ran = await run(
      [
        "-y",
        "-ss",
        start.toFixed(3),
        "-to",
        end.toFixed(3),
        "-i",
        sourceUrl,
        ...(retention
          ? [
              // Loops forever, so the output length has to be set below.
              "-stream_loop",
              "-1",
              "-ss",
              retentionStartSec(start, retention.durationSec).toFixed(3),
              "-i",
              retention.sourceUrl,
              "-filter_complex",
              splitScreenFilter(captions.enabled),
              "-map",
              "[out]",
              // The clip's sound only: the retention video stays muted.
              "-map",
              "0:a?",
              "-t",
              (end - start).toFixed(3),
            ]
          : filters.length
            ? ["-vf", filters.join(",")]
            : []),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        "clip.mp4",
      ],
      {
        cwd: dir,
        env: { ...process.env, FONTCONFIG_FILE: join(dir, "fonts.conf") },
        onStdout: progressReader(end - start, options.onFraction),
      }
    );
    if (ran.code !== 0)
      throw new Error(
        `Rendering the clip failed (exit ${ran.code}): ${ran.stderr.trim().split(/\r?\n/).slice(-3).join(" ")}`
      );
    return await withFile(join(dir, "clip.mp4"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Copies a video's speech into a small audio file and calls `withFile` with
 * it. AssemblyAI only needs the audio, so a local run uploads far less. The
 * timings stay the same as the video's.
 */
export async function extractAudio<T>(
  sourcePath: string,
  withFile: (path: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "clip-studio-audio-"));
  try {
    const ran = await run(
      [
        "-y",
        "-i",
        sourcePath,
        "-vn",
        "-ac",
        "1",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "audio.m4a",
      ],
      { cwd: dir }
    );
    if (ran.code !== 0)
      throw new Error(
        `Reading the video's audio failed (exit ${ran.code}): ${ran.stderr.trim().split(/\r?\n/).slice(-3).join(" ")}`
      );
    return await withFile(join(dir, "audio.m4a"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Whether the ffmpeg binary starts. */
export async function ffmpegWorks(): Promise<boolean> {
  try {
    const ran = await run(["-version"], { cwd: tmpdir() });
    return ran.code === 0;
  } catch {
    return false;
  }
}
