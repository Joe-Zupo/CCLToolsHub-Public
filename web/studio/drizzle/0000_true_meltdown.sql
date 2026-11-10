CREATE TABLE "clip_studio_configs" (
	"installation_id" text NOT NULL,
	"sub" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"assembly_ai_key_enc" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clip_studio_configs_installation_id_sub_pk" PRIMARY KEY("installation_id","sub")
);
--> statement-breakpoint
CREATE TABLE "clip_studio_exports" (
	"job_id" text NOT NULL,
	"clip_id" text NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"start" real,
	"end" real,
	"title" text,
	"caption" text,
	"url" text,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clip_studio_exports_job_id_clip_id_format_pk" PRIMARY KEY("job_id","clip_id","format")
);
--> statement-breakpoint
CREATE TABLE "clip_studio_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"sub" text NOT NULL,
	"file_name" text NOT NULL,
	"source_url" text NOT NULL,
	"duration_sec" real NOT NULL,
	"clip_count" integer DEFAULT 5 NOT NULL,
	"status" text NOT NULL,
	"progress" jsonb,
	"error" text,
	"transcript_id" text,
	"transcript" jsonb,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clip_studio_exports" ADD CONSTRAINT "clip_studio_exports_job_id_clip_studio_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."clip_studio_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clip_studio_jobs_owner_created_idx" ON "clip_studio_jobs" USING btree ("installation_id","sub","created_at");