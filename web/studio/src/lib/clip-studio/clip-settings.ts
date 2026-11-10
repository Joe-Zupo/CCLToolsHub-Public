import { z } from "zod";

import {
  CAPTION_FONTS,
  DEFAULT_CAPTIONS,
  MAX_CLIP_SEC,
  MAX_CLIPS,
  MIN_CLIP_RANGE_SEC,
  MIN_CLIP_SEC,
  MIN_CLIPS,
  type CaptionFont,
  type ClipSettings,
} from "./types";

/** What a member may ask for. The limits are enforced here, not just in the UI. */

const clipSettingsBody = z
  .object({
    clipCount: z.number().int().min(MIN_CLIPS).max(MAX_CLIPS),
    minSec: z.number().int().min(MIN_CLIP_SEC).max(MAX_CLIP_SEC),
    maxSec: z.number().int().min(MIN_CLIP_SEC).max(MAX_CLIP_SEC),
  })
  .partial();

export const CLIP_SETTINGS_ERROR = `Ask for ${MIN_CLIPS} to ${MAX_CLIPS} clips, each ${MIN_CLIP_SEC} seconds to ${MAX_CLIP_SEC / 60} minutes long, with the longest at least ${MIN_CLIP_RANGE_SEC} seconds above the shortest.`;

/** A request's settings, falling back to the job's own; null when not allowed. */
export function readClipSettings(
  body: unknown,
  job: { clipCount: number; clipMinSec: number; clipMaxSec: number }
): ClipSettings | null {
  const parsed = clipSettingsBody.safeParse(body);
  if (!parsed.success) return null;
  const settings = {
    clipCount: parsed.data.clipCount ?? job.clipCount,
    minSec: parsed.data.minSec ?? job.clipMinSec,
    maxSec: parsed.data.maxSec ?? job.clipMaxSec,
  };
  return settings.maxSec - settings.minSec >= MIN_CLIP_RANGE_SEC
    ? settings
    : null;
}

const fontIds = CAPTION_FONTS.map((font) => font.id) as [
  CaptionFont,
  ...CaptionFont[],
];

export const captionOptions = z
  .object({
    enabled: z.boolean(),
    font: z.enum(fontIds),
    position: z.enum(["high", "middle", "low"]).default("low"),
    highlight: z.boolean(),
  })
  .default(DEFAULT_CAPTIONS);
