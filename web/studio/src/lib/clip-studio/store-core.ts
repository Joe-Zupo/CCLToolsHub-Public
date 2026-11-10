import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";

import type { Sentence } from "./agent/clip-agent";
import type { Word } from "./assemblyai";
import { decrypt, encrypt } from "./crypto";
import type {
  CaptionOptions,
  ClipCandidateJson,
  ClipExportJson,
  ConfigJson,
  ConfigUpdate,
  ExportFormat,
  ExportStatus,
  JobJson,
  JobStatus,
  Progress,
  RetentionVideoJson,
} from "./types";

/**
 * Clip Studio's storage, in PGlite on the Creator's computer. Every function
 * takes an `Owner` and only touches that owner's rows.
 *
 * Built by a factory so the tests can run it against an in-memory database.
 */

const {
  clipStudioConfigs,
  clipStudioExports,
  clipStudioJobs,
  clipStudioRetentionVideos,
} = schema;

export type ClipDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type Owner = { installationId: string; sub: string };

/** A viewer's config with keys decrypted. Server only. */
export type StoredConfig = {
  displayName: string;
  assemblyAiKey: string;
};

export type Transcript = { sentences: Sentence[]; words: Word[] };
type JobRow = typeof clipStudioJobs.$inferSelect;
type ExportRow = typeof clipStudioExports.$inferSelect;

export type JobPatch = Partial<
  Pick<
    JobRow,
    | "status"
    | "progress"
    | "error"
    | "transcriptId"
    | "transcript"
    | "candidates"
    | "durationSec"
    | "clipCount"
    | "clipMinSec"
    | "clipMaxSec"
  >
>;

/**
 * Finding clips and exporting run in the server process and end with it, so
 * when the database opens, nothing marked as running really is. Without this,
 * a restart would leave those jobs waiting forever.
 */
export async function recoverInterrupted(db: ClipDb): Promise<void> {
  const error = "The studio closed before this finished. Try again.";
  await db
    .update(clipStudioJobs)
    .set({ status: "transcribed", progress: null, error })
    .where(eq(clipStudioJobs.status, "analyzing"));
  await db
    .update(clipStudioExports)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(inArray(clipStudioExports.status, ["editing", "rendering"]));
  await db
    .update(clipStudioJobs)
    .set({ progress: null })
    .where(
      sql`${clipStudioJobs.progress}->>'stage' in ('editing', 'rendering')`
    );
}

export const configJson = (config: StoredConfig): ConfigJson => ({
  displayName: config.displayName,
  hasAssemblyAiKey: Boolean(config.assemblyAiKey),
});

const exportJson = (row: ExportRow): ClipExportJson => ({
  clipId: row.clipId,
  format: row.format as ExportFormat,
  status: row.status as ExportStatus,
  start: row.start,
  end: row.end,
  title: row.title,
  caption: row.caption,
  captions: (row.captions as CaptionOptions | null) ?? null,
  retentionName: row.retentionName,
  url: row.url,
  error: row.error,
});

const jobJson = (row: JobRow, exports: ExportRow[]): JobJson => ({
  id: row.id,
  fileName: row.fileName,
  sourceUrl: row.sourceUrl,
  createdAt: row.createdAt.toISOString(),
  durationSec: row.durationSec,
  clipCount: row.clipCount,
  clipMinSec: row.clipMinSec,
  clipMaxSec: row.clipMaxSec,
  status: row.status as JobStatus,
  progress: (row.progress as Progress | null) ?? null,
  error: row.error,
  candidates: row.candidates as ClipCandidateJson[],
  exports: exports.map(exportJson),
});

const retentionJson = (
  row: typeof clipStudioRetentionVideos.$inferSelect
): RetentionVideoJson => ({
  id: row.id,
  fileName: row.fileName,
  durationSec: row.durationSec,
  url: row.url,
  createdAt: row.createdAt.toISOString(),
});

const keep = (next: string | undefined, current: string) =>
  next === undefined || next.trim() === "" ? current : next.trim();

export const newJobId = () => randomUUID().replace(/-/g, "").slice(0, 12);

export function createClipStore(db: ClipDb) {
  const ownerConfig = (owner: Owner) =>
    and(
      eq(clipStudioConfigs.installationId, owner.installationId),
      eq(clipStudioConfigs.sub, owner.sub)
    );

  const ownerJob = (owner: Owner, jobId: string) =>
    and(
      eq(clipStudioJobs.id, jobId),
      eq(clipStudioJobs.installationId, owner.installationId),
      eq(clipStudioJobs.sub, owner.sub)
    );

  /** Whether the owner has this job; export queries check it first. */
  const ownsJob = async (owner: Owner, jobId: string) => {
    const [row] = await db
      .select({ id: clipStudioJobs.id })
      .from(clipStudioJobs)
      .where(ownerJob(owner, jobId))
      .limit(1);
    return Boolean(row);
  };

  const exportKey = (jobId: string, clipId: string, format: ExportFormat) =>
    and(
      eq(clipStudioExports.jobId, jobId),
      eq(clipStudioExports.clipId, clipId),
      eq(clipStudioExports.format, format)
    );

  async function readConfig(owner: Owner): Promise<StoredConfig> {
    const [row] = await db
      .select()
      .from(clipStudioConfigs)
      .where(ownerConfig(owner))
      .limit(1);
    return {
      displayName: row?.displayName ?? "",
      assemblyAiKey: decrypt(row?.assemblyAiKeyEnc ?? ""),
    };
  }

  async function updateConfig(
    owner: Owner,
    update: ConfigUpdate
  ): Promise<StoredConfig> {
    const current = await readConfig(owner);
    const next: StoredConfig = {
      displayName: update.displayName?.trim() ?? current.displayName,
      assemblyAiKey: keep(update.assemblyAiKey, current.assemblyAiKey),
    };
    const row = {
      displayName: next.displayName,
      assemblyAiKeyEnc: encrypt(next.assemblyAiKey),
      updatedAt: new Date(),
    };
    await db
      .insert(clipStudioConfigs)
      .values({ ...owner, ...row })
      .onConflictDoUpdate({
        target: [clipStudioConfigs.installationId, clipStudioConfigs.sub],
        set: row,
      });
    return next;
  }

  async function createJob(
    owner: Owner,
    job: Pick<JobJson, "fileName" | "sourceUrl" | "durationSec">
  ): Promise<JobJson> {
    const [row] = await db
      .insert(clipStudioJobs)
      .values({ id: newJobId(), ...owner, ...job, status: "uploaded" })
      .returning();
    return jobJson(row!, []);
  }

  /** A job row of the owner's, with its transcript. Server only. */
  async function readJobRow(
    owner: Owner,
    jobId: string
  ): Promise<JobRow | null> {
    const [row] = await db
      .select()
      .from(clipStudioJobs)
      .where(ownerJob(owner, jobId))
      .limit(1);
    return row ?? null;
  }

  async function readJob(owner: Owner, jobId: string): Promise<JobJson | null> {
    const row = await readJobRow(owner, jobId);
    if (!row) return null;
    const exports = await db
      .select()
      .from(clipStudioExports)
      .where(eq(clipStudioExports.jobId, row.id))
      .orderBy(clipStudioExports.updatedAt);
    return jobJson(row, exports);
  }

  async function listJobs(owner: Owner): Promise<JobJson[]> {
    const rows = await db
      .select()
      .from(clipStudioJobs)
      .where(
        and(
          eq(clipStudioJobs.installationId, owner.installationId),
          eq(clipStudioJobs.sub, owner.sub)
        )
      )
      .orderBy(desc(clipStudioJobs.createdAt))
      .limit(50);
    return rows.map((row) => jobJson(row, []));
  }

  /**
   * Applies `patch` to one of the owner's jobs. With `onlyIf`, only while
   * the job is in one of those statuses, so two requests cannot both start
   * the same step: the return value says whether this one won.
   */
  async function updateJob(
    owner: Owner,
    jobId: string,
    patch: JobPatch,
    onlyIf?: JobStatus[]
  ): Promise<boolean> {
    const updated = await db
      .update(clipStudioJobs)
      .set(patch)
      .where(
        onlyIf
          ? and(ownerJob(owner, jobId), inArray(clipStudioJobs.status, onlyIf))
          : ownerJob(owner, jobId)
      )
      .returning({ id: clipStudioJobs.id });
    return updated.length > 0;
  }

  const ownerRetention = (owner: Owner) =>
    and(
      eq(clipStudioRetentionVideos.installationId, owner.installationId),
      eq(clipStudioRetentionVideos.sub, owner.sub)
    );

  async function addRetentionVideo(
    owner: Owner,
    video: Pick<RetentionVideoJson, "fileName" | "url" | "durationSec">
  ): Promise<RetentionVideoJson> {
    const [row] = await db
      .insert(clipStudioRetentionVideos)
      .values({ ...owner, ...video })
      .returning();
    return retentionJson(row!);
  }

  async function listRetentionVideos(
    owner: Owner
  ): Promise<RetentionVideoJson[]> {
    const rows = await db
      .select()
      .from(clipStudioRetentionVideos)
      .where(ownerRetention(owner))
      .orderBy(desc(clipStudioRetentionVideos.createdAt));
    return rows.map(retentionJson);
  }

  async function readRetentionVideo(
    owner: Owner,
    id: string
  ): Promise<RetentionVideoJson | null> {
    const [row] = await db
      .select()
      .from(clipStudioRetentionVideos)
      .where(and(ownerRetention(owner), eq(clipStudioRetentionVideos.id, id)))
      .limit(1);
    return row ? retentionJson(row) : null;
  }

  /** Deletes one of the owner's retention videos; returns its file name, or null. */
  async function deleteRetentionVideo(
    owner: Owner,
    id: string
  ): Promise<string | null> {
    const [row] = await db
      .delete(clipStudioRetentionVideos)
      .where(and(ownerRetention(owner), eq(clipStudioRetentionVideos.id, id)))
      .returning({ url: clipStudioRetentionVideos.url });
    return row?.url ?? null;
  }

  /** Deletes one of the owner's jobs and its clips; returns the blob URLs to remove. */
  async function deleteJob(owner: Owner, jobId: string): Promise<string[]> {
    const row = await readJobRow(owner, jobId);
    if (!row) return [];
    const exports = await db
      .select({ url: clipStudioExports.url })
      .from(clipStudioExports)
      .where(eq(clipStudioExports.jobId, row.id));
    await db.delete(clipStudioJobs).where(ownerJob(owner, jobId));
    return [row.sourceUrl, ...exports.flatMap((e) => (e.url ? [e.url] : []))];
  }

  /** Creates or updates a clip of one of the owner's jobs. False when the job is not theirs. */
  async function upsertExport(
    owner: Owner,
    jobId: string,
    clipId: string,
    format: ExportFormat,
    patch: Partial<Omit<ExportRow, "jobId" | "clipId" | "format">>
  ): Promise<boolean> {
    if (!(await ownsJob(owner, jobId))) return false;
    const set = { ...patch, updatedAt: new Date() };
    await db
      .insert(clipStudioExports)
      .values({ jobId, clipId, format, status: "editing", ...set })
      .onConflictDoUpdate({
        target: [
          clipStudioExports.jobId,
          clipStudioExports.clipId,
          clipStudioExports.format,
        ],
        set,
      });
    return true;
  }

  /** The URL of a clip being replaced, so its old file can be removed. */
  async function exportUrl(
    owner: Owner,
    jobId: string,
    clipId: string,
    format: ExportFormat
  ): Promise<string | null> {
    if (!(await ownsJob(owner, jobId))) return null;
    const [row] = await db
      .select({ url: clipStudioExports.url })
      .from(clipStudioExports)
      .where(exportKey(jobId, clipId, format))
      .limit(1);
    return row?.url ?? null;
  }

  /**
   * Deletes everything Clip Studio keeps about the owner: keys, settings,
   * videos and clips. Returns the files to remove.
   */
  async function deleteOwnerData(owner: Owner): Promise<string[]> {
    const jobs = await db
      .select({ id: clipStudioJobs.id, url: clipStudioJobs.sourceUrl })
      .from(clipStudioJobs)
      .where(
        and(
          eq(clipStudioJobs.installationId, owner.installationId),
          eq(clipStudioJobs.sub, owner.sub)
        )
      );
    const exports = jobs.length
      ? await db
          .select({ url: clipStudioExports.url })
          .from(clipStudioExports)
          .where(
            inArray(
              clipStudioExports.jobId,
              jobs.map((j) => j.id)
            )
          )
      : [];
    await db
      .delete(clipStudioJobs)
      .where(
        and(
          eq(clipStudioJobs.installationId, owner.installationId),
          eq(clipStudioJobs.sub, owner.sub)
        )
      );
    await db.delete(clipStudioConfigs).where(ownerConfig(owner));
    const retention = await db
      .delete(clipStudioRetentionVideos)
      .where(ownerRetention(owner))
      .returning({ url: clipStudioRetentionVideos.url });
    return [
      ...retention.map((video) => video.url),
      ...jobs.map((j) => j.url),
      ...exports.flatMap((e) => (e.url ? [e.url] : [])),
    ];
  }

  return {
    deleteOwnerData,
    readConfig,
    updateConfig,
    createJob,
    readJobRow,
    readJob,
    listJobs,
    updateJob,
    addRetentionVideo,
    listRetentionVideos,
    readRetentionVideo,
    deleteRetentionVideo,
    deleteJob,
    upsertExport,
    exportUrl,
  };
}

export type ClipStore = ReturnType<typeof createClipStore>;
