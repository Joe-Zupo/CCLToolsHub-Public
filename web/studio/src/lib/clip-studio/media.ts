import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";

import { dataFolder } from "@/lib/data-folder";

import type { ExportFormat, JobJson } from "./types";

/**
 * Videos and clips live under the data folder. The database stores each file's
 * name relative to that folder, and the browser reads it through the files route.
 */
const root = () => resolve(dataFolder(), "clip-studio", "media");

export function mediaPath(name: string): string {
  const full = resolve(root(), name);
  if (!full.startsWith(root() + sep)) throw new Error("Bad media path.");
  return full;
}

/** The full path for a new file, with its folder created. */
export async function prepareMediaFile(name: string): Promise<string> {
  const path = mediaPath(name);
  await mkdir(dirname(path), { recursive: true });
  return path;
}

export function newUploadName(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  return `uploads/${randomUUID()}${/^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".mp4"}`;
}

export const isUploadName = (name: string) =>
  /^uploads\/[\w-]+\.[a-z0-9]{1,8}$/.test(name);

export const exportName = (
  jobId: string,
  clipId: string,
  format: ExportFormat
) => `exports/${jobId}/${clipId}-${format}-${randomUUID().slice(0, 8)}.mp4`;

export async function removeMedia(names: string[]): Promise<void> {
  await Promise.all(
    names.filter(Boolean).map((name) => rm(mediaPath(name), { force: true }))
  );
}

export const mediaLink = (name: string) =>
  `/api/clip-studio/files/${name.split("/").map(encodeURIComponent).join("/")}`;

/** The job with browser links in place of its file names. */
export function withLocalLinks(job: JobJson): JobJson {
  return {
    ...job,
    sourceUrl: job.sourceUrl ? mediaLink(job.sourceUrl) : "",
    exports: job.exports.map((entry) => ({
      ...entry,
      url: entry.url ? mediaLink(entry.url) : null,
    })),
  };
}

export const mediaFolder = () => join(root());
