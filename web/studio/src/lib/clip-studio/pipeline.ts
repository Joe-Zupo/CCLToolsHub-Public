import { copyFile } from "node:fs/promises";

import { AgentError, agentFor } from "./agent";
import { checkBudget, findClips, planClipEdit } from "./agent/clip-agent";
import {
  assemblyAiReady,
  checkTranscript,
  startTranscript,
  uploadMedia,
} from "./assemblyai";
import { explainFailure, type FailedStep } from "./errors";
import { extractAudio, ffmpegWorks, renderClip } from "./ffmpeg";
import { exportName, mediaPath, removeMedia, prepareMediaFile } from "./media";
import {
  exportUrl,
  readConfig,
  readJobRow,
  updateJob,
  upsertExport,
  type Owner,
  type StoredConfig,
  type Transcript,
} from "./store";
import type {
  CaptionOptions,
  ClipCandidateJson,
  ClipSettings,
  ExportFormat,
  PreflightJson,
  Progress,
  Readiness,
  RetentionVideoJson,
  ServiceId,
} from "./types";

/**
 * The clipping flow. The job row is the state, and conditional updates stop two
 * requests from starting the same step.
 *
 * 1. Transcribe: send the video to AssemblyAI and start a transcript.
 * 2. Each browser poll checks it once; the poll that sees it finish claims
 *    the job and finds clips in `after()`.
 * 3. Export: one request per clip, so clips render in parallel.
 */

const storageReady = async (): Promise<Readiness> => {
  if (!(await ffmpegWorks()))
    return {
      ok: false,
      message: "The video renderer (ffmpeg) does not start on this computer.",
    };
  return { ok: true };
};

/** Readiness for the named services, checked together. */
export async function preflight(
  config: StoredConfig,
  services: ServiceId[]
): Promise<Partial<PreflightJson>> {
  const checks: Record<ServiceId, () => Promise<Readiness>> = {
    agent: () => agentFor().ready(),
    assemblyai: () => assemblyAiReady(config.assemblyAiKey),
    storage: storageReady,
  };
  const answers = await Promise.all(services.map((id) => checks[id]()));
  return Object.fromEntries(services.map((id, i) => [id, answers[i]]));
}

/** The first failed check's message, or null when every check passed. */
export const blocked = (result: Partial<PreflightJson>) =>
  Object.values(result).find(
    (readiness): readiness is { ok: false; message: string } =>
      readiness !== undefined && !readiness.ok
  )?.message ?? null;

/** The sentence for the page; the technical text stays in the server log. */
const explained = (error: unknown, step: FailedStep) => {
  console.error(
    `[clip-studio] ${step} failed:`,
    error instanceof AgentError && error.detail ? error.detail : error
  );
  return explainFailure(error, step);
};

export async function startTranscription(
  owner: Owner,
  jobId: string,
  settings: ClipSettings
): Promise<void> {
  const config = await readConfig(owner);
  const job = await readJobRow(owner, jobId);
  if (!job) return;
  const transcriptId = await startTranscript(
    config.assemblyAiKey,
    // Only the sound goes up, which is far smaller and all it needs.
    await extractAudio(mediaPath(job.sourceUrl), (path) =>
      uploadMedia(config.assemblyAiKey, path)
    )
  );
  const progress: Progress = {
    stage: "transcribing",
    percent: null,
    message: "AssemblyAI is transcribing",
  };
  await updateJob(owner, jobId, {
    status: "transcribing",
    transcriptId,
    clipCount: settings.clipCount,
    clipMinSec: settings.minSec,
    clipMaxSec: settings.maxSec,
    progress,
    error: null,
  });
}

/**
 * Checks a transcribing job once. When the transcript is done, saves it and
 * claims the job for finding clips; returns that work for the caller to run
 * in `after()`, or null when there is nothing more to do now.
 */
export async function refreshTranscription(
  owner: Owner,
  jobId: string
): Promise<(() => Promise<void>) | null> {
  const job = await readJobRow(owner, jobId);
  if (!job || job.status !== "transcribing" || !job.transcriptId) return null;
  const config = await readConfig(owner);
  const state = await checkTranscript(config.assemblyAiKey, job.transcriptId);

  if (state.status === "error") {
    const error = explained(new Error(state.error), "transcribe");
    await updateJob(owner, jobId, { status: "failed", error, progress: null }, [
      "transcribing",
    ]);
    return null;
  }
  if (state.status !== "completed") return null;

  const transcript: Transcript = {
    sentences: state.sentences,
    words: state.words,
  };
  const progress: Progress = {
    stage: "analyzing",
    percent: null,
    message: `Transcribed ${state.sentences.length} sentences. Finding clips`,
  };
  const won = await updateJob(
    owner,
    jobId,
    {
      status: "analyzing",
      transcript,
      progress,
      ...(state.durationSec ? { durationSec: state.durationSec } : {}),
    },
    ["transcribing"]
  );
  if (!won) return null;
  return () => analyze(owner, jobId);
}

/** Claims a transcribed job for finding clips again; null when another request has it. */
export async function claimAnalysis(
  owner: Owner,
  jobId: string,
  settings: ClipSettings
): Promise<(() => Promise<void>) | null> {
  const progress: Progress = {
    stage: "analyzing",
    percent: null,
    message: "Finding clips",
  };
  const won = await updateJob(
    owner,
    jobId,
    {
      status: "analyzing",
      clipCount: settings.clipCount,
      clipMinSec: settings.minSec,
      clipMaxSec: settings.maxSec,
      progress,
      error: null,
    },
    ["transcribed", "analyzed"]
  );
  return won ? () => analyze(owner, jobId) : null;
}

/** Finds clips for a job already marked "analyzing". */
async function analyze(owner: Owner, jobId: string): Promise<void> {
  const job = await readJobRow(owner, jobId);
  const transcript = job?.transcript as Transcript | null;
  if (!job || !transcript) return;
  const agent = agentFor();

  const fail = async (error: string) => {
    await updateJob(owner, jobId, {
      status: "transcribed",
      error,
      progress: null,
    });
  };

  const readiness = await agent.ready();
  if (!readiness.ok) return fail(`Could not find clips: ${readiness.message}`);
  const budget = checkBudget(
    agent,
    transcript.sentences.map((s) => `[0000.0-0000.0] ${s.text}`).join("\n") +
      " ".repeat(2000)
  );
  if (!budget.ok) return fail(`Could not find clips: ${budget.message}`);

  try {
    const candidates: ClipCandidateJson[] = await findClips(agent, {
      sentences: transcript.sentences,
      durationSec: job.durationSec,
      count: job.clipCount,
      minSec: job.clipMinSec,
      maxSec: job.clipMaxSec,
    });
    const progress: Progress = {
      stage: "analyzed",
      percent: 100,
      message:
        candidates.length < job.clipCount
          ? `Found ${candidates.length} of the ${job.clipCount} clips you asked for; the rest of the video had no strong moments`
          : `Found ${candidates.length} ${candidates.length === 1 ? "clip" : "clips"}`,
    };
    await updateJob(owner, jobId, {
      status: "analyzed",
      candidates,
      progress,
      error: null,
    });
  } catch (error) {
    await fail(explained(error, "find-clips"));
  }
}

/**
 * Edits and renders one clip: the agent tightens the cut and writes the
 * title and caption, ffmpeg renders it, and the MP4 is saved on this computer.
 */
export async function exportClip(
  owner: Owner,
  jobId: string,
  clipId: string,
  format: ExportFormat,
  captions: CaptionOptions,
  retention: RetentionVideoJson | null = null
): Promise<void> {
  const job = await readJobRow(owner, jobId);
  const transcript = job?.transcript as Transcript | null;
  const candidate = (job?.candidates as ClipCandidateJson[] | undefined)?.find(
    (c) => c.id === clipId
  );
  if (!job || !transcript || !candidate) return;

  const tell = (progress: Progress | null, error: string | null = null) =>
    updateJob(owner, jobId, { progress, error });

  try {
    await tell({
      stage: "editing",
      percent: null,
      message: `Editing "${candidate.title}"`,
    });
    const edit = await planClipEdit(agentFor(), {
      candidate,
      sentences: transcript.sentences,
      durationSec: job.durationSec,
      minSec: job.clipMinSec,
      maxSec: job.clipMaxSec,
    });
    await upsertExport(owner, jobId, clipId, format, {
      status: "rendering",
      ...edit,
    });
    await tell({
      stage: "rendering",
      percent: 0,
      message: `Rendering "${edit.title}"`,
    });

    const previous = await exportUrl(owner, jobId, clipId, format);
    const file = await renderClip(
      {
        sourceUrl: mediaPath(job.sourceUrl),
        start: edit.start,
        end: edit.end,
        words: transcript.words,
        format,
        captions,
        retention: retention && {
          sourceUrl: mediaPath(retention.url),
          durationSec: retention.durationSec,
        },
        onFraction: (fraction) =>
          void tell({
            stage: "rendering",
            percent: Math.round(fraction * 100),
            message: `Rendering "${edit.title}"`,
          }),
      },
      async (path) => {
        const name = exportName(jobId, clipId, format);
        await copyFile(path, await prepareMediaFile(name));
        return name;
      }
    );
    await upsertExport(owner, jobId, clipId, format, {
      status: "done",
      url: file,
      error: null,
    });
    if (previous && previous !== file) await removeMedia([previous]);
    await tell({
      stage: "exported",
      percent: 100,
      message: `"${edit.title}" is ready`,
    });
  } catch (error) {
    const reason = explained(error, "export");
    await upsertExport(owner, jobId, clipId, format, {
      status: "failed",
      error: reason,
    });
    await tell(null, reason);
  }
}
