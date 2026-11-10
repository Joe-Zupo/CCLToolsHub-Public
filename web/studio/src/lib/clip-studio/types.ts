// Shapes shared by the Clip Studio API and the browser. No Node imports here.

export type Readiness = { ok: true } | { ok: false; message: string };

export type ExportFormat = "vertical" | "original";

/** What the browser sees of the config: keys are never sent back, only whether they are set. */
export type ConfigJson = {
  displayName: string;
  hasAssemblyAiKey: boolean;
};

/** A config change. An empty or missing secret leaves the stored one alone. */
export type ConfigUpdate = {
  displayName?: string;
  assemblyAiKey?: string;
};

export type ServiceId = "agent" | "assemblyai" | "storage";
export type PreflightJson = Record<ServiceId, Readiness>;

/**
 * uploaded → transcribing → analyzing → analyzed. "transcribed" is where a
 * job waits when finding clips failed or the agent was not ready.
 */
export type JobStatus =
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "analyzing"
  | "analyzed"
  | "failed";

export type Progress = {
  stage: string;
  percent: number | null;
  message: string;
};

export type ClipCandidateJson = {
  id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
};

export type ExportStatus = "editing" | "rendering" | "done" | "failed";

export type ClipExportJson = {
  clipId: string;
  status: ExportStatus;
  format: ExportFormat;
  start: number | null;
  end: number | null;
  title: string | null;
  caption: string | null;
  /** The captions it was rendered with; null for clips made before the choice existed. */
  captions: CaptionOptions | null;
  /** The file name of the retention video under the clip, if any. */
  retentionName: string | null;
  url: string | null;
  error: string | null;
};

export type JobJson = {
  id: string;
  fileName: string;
  sourceUrl: string;
  createdAt: string;
  durationSec: number;
  /** How many clips to look for, 1-5. */
  clipCount: number;
  /** Shortest and longest clip asked for, in seconds. */
  clipMinSec: number;
  clipMaxSec: number;
  status: JobStatus;
  progress: Progress | null;
  /** The last failure, kept beside a status that still allows a retry. */
  error: string | null;
  candidates: ClipCandidateJson[];
  exports: ClipExportJson[];
};

export const MIN_CLIPS = 1;
export const MAX_CLIPS = 5;
export const MIN_CLIP_SEC = 30;
export const MAX_CLIP_SEC = 180;
/** Cuts land on sentence ends, so a range needs room to land in. */
export const MIN_CLIP_RANGE_SEC = 15;

/** "30 sec", "1 min", "1 min 30 sec". */
export const lengthLabel = (seconds: number) => {
  if (seconds < 60) return `${seconds} sec`;
  const rest = seconds % 60;
  return rest
    ? `${Math.floor(seconds / 60)} min ${rest} sec`
    : `${seconds / 60} min`;
};

/** How many clips to find in a video, and how long each may be. */
export type ClipSettings = {
  clipCount: number;
  minSec: number;
  maxSec: number;
};

export const DEFAULT_CLIP_SETTINGS: ClipSettings = {
  clipCount: MAX_CLIPS,
  minSec: MIN_CLIP_SEC,
  maxSec: 90,
};

export const CAPTION_FONTS = [
  { id: "modern", label: "Modern" },
  { id: "clean", label: "Clean" },
  { id: "impact", label: "Impact" },
  { id: "condensed", label: "Condensed" },
  { id: "comic", label: "Comic" },
] as const;

export type CaptionFont = (typeof CAPTION_FONTS)[number]["id"];

export const CAPTION_POSITIONS = [
  { id: "high", label: "High" },
  { id: "middle", label: "Middle" },
  { id: "low", label: "Low" },
] as const;

export type CaptionPosition = (typeof CAPTION_POSITIONS)[number]["id"];

/** Captions burned into a clip. */
export type CaptionOptions = {
  enabled: boolean;
  font: CaptionFont;
  /** Where on the frame the words sit. */
  position: CaptionPosition;
  /** Colours the word being said, the way TikTok and Reels captions do. */
  highlight: boolean;
};

export const DEFAULT_CAPTIONS: CaptionOptions = {
  enabled: true,
  font: "modern",
  position: "low",
  highlight: true,
};

export const HIGHLIGHT_COLOR = "#FFE500";

/** The Creator's video to play under clips, such as gameplay. */
export type RetentionVideoJson = {
  id: string;
  fileName: string;
  durationSec: number;
  /** A file name on the server, and a browser link once a route has sent it. */
  url: string;
  createdAt: string;
};
