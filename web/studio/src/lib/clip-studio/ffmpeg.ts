import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegStatic from "ffmpeg-static";

import type { Word } from "./assemblyai";
import { env } from "./env";
import type { ExportFormat } from "./types";

/**
 * ffmpeg renders the finished clips. It is the static build from
 * `ffmpeg-static`, so the Creator needs no system install.
 */

const ffmpeg = () => env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";

/** The caption font ships in the repo, so every computer renders captions the same. */
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
    const child = spawn(ffmpeg(), args, {
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

const srtTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

/**
 * Burned-in captions for the clip [start, end]: a few words at a time, the
 * way short-form captions read, timed from the clip's own start.
 */
export function captionsSrt(words: Word[], start: number, end: number): string {
  const inClip = words.filter((w) => w.end > start && w.start < end);
  const groups: Word[][] = [];
  for (const word of inClip) {
    const group = groups.at(-1);
    const gap = group ? word.start - group.at(-1)!.end : Infinity;
    if (!group || group.length >= 3 || gap > 0.8) groups.push([word]);
    else group.push(word);
  }
  return groups
    .map((group, i) => {
      const from = Math.max(group[0]!.start, start) - start;
      const to = Math.min(group.at(-1)!.end, end) - start;
      const text = group.map((w) => w.text).join(" ");
      return `${i + 1}\n${srtTime(from)} --> ${srtTime(to)}\n${text}\n`;
    })
    .join("\n");
}

const CAPTION_STYLE =
  "FontName=DejaVu Sans,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=60";

/**
 * Renders one clip with captions burned in and calls `withFile` with the
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
    onFraction: (fraction: number) => void;
  },
  withFile: (path: string) => Promise<T>
): Promise<T> {
  const { sourceUrl, start, end, words, format } = options;
  const dir = await mkdtemp(join(tmpdir(), "clip-studio-"));
  try {
    await writeFile(join(dir, "captions.srt"), captionsSrt(words, start, end));
    // A font config of our own, since the host may have none.
    await writeFile(
      join(dir, "fonts.conf"),
      `<?xml version="1.0"?><fontconfig><dir>${fontsDir()}</dir><cachedir>${join(dir, "fontcache")}</cachedir></fontconfig>`
    );
    const filters = [
      ...(format === "vertical"
        ? [
            "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'",
            "scale=1080:1920",
            "setsar=1",
          ]
        : []),
      `subtitles=captions.srt:fontsdir=fonts:force_style='${CAPTION_STYLE}'`,
    ];
    // `fontsdir` is relative to the folder ffmpeg runs in.
    await cp(fontsDir(), join(dir, "fonts"), { recursive: true });
    const ran = await run(
      [
        "-y",
        "-ss",
        start.toFixed(3),
        "-to",
        end.toFixed(3),
        "-i",
        sourceUrl,
        "-vf",
        filters.join(","),
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

/** Whether the ffmpeg binary starts. */
export async function ffmpegWorks(): Promise<boolean> {
  try {
    const ran = await run(["-version"], { cwd: tmpdir() });
    return ran.code === 0;
  } catch {
    return false;
  }
}
