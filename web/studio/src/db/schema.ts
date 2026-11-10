import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Clip Studio settings, one row per viewer (installation + `sub` from the
 * verified claims). Keys are encrypted with this computer's secret; the
 * `*Enc` columns never hold plain text.
 */
export const clipStudioConfigs = pgTable(
  "clip_studio_configs",
  {
    installationId: text("installation_id").notNull(),
    sub: text("sub").notNull(),
    displayName: text("display_name").notNull().default(""),
    assemblyAiKeyEnc: text("assembly_ai_key_enc").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.installationId, table.sub] })]
);

/** One uploaded video and what Clip Studio found in it. */
export const clipStudioJobs = pgTable(
  "clip_studio_jobs",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id").notNull(),
    sub: text("sub").notNull(),
    fileName: text("file_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    durationSec: real("duration_sec").notNull(),
    /** How many clips the member asked for, 1-5. */
    clipCount: integer("clip_count").notNull().default(5),
    status: text("status").notNull(),
    progress: jsonb("progress"),
    error: text("error"),
    transcriptId: text("transcript_id"),
    /** Sentences and words with timings, from AssemblyAI. Never sent to the browser. */
    transcript: jsonb("transcript"),
    candidates: jsonb("candidates").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("clip_studio_jobs_owner_created_idx").on(
      table.installationId,
      table.sub,
      table.createdAt
    ),
  ]
);

/** One rendered clip. Separate rows so clips can render in parallel. */
export const clipStudioExports = pgTable(
  "clip_studio_exports",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => clipStudioJobs.id, { onDelete: "cascade" }),
    clipId: text("clip_id").notNull(),
    format: text("format").notNull(),
    status: text("status").notNull(),
    start: real("start"),
    end: real("end"),
    title: text("title"),
    caption: text("caption"),
    url: text("url"),
    error: text("error"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.clipId, table.format] }),
  ]
);
