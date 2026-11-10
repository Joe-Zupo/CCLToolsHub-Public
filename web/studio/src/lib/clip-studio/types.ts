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
  status: JobStatus;
  progress: Progress | null;
  /** The last failure, kept beside a status that still allows a retry. */
  error: string | null;
  candidates: ClipCandidateJson[];
  exports: ClipExportJson[];
};

export const MIN_CLIPS = 1;
export const MAX_CLIPS = 5;
