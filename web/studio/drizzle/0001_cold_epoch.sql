CREATE TABLE "clip_studio_retention_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" text NOT NULL,
	"sub" text NOT NULL,
	"file_name" text NOT NULL,
	"url" text NOT NULL,
	"duration_sec" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clip_studio_exports" ADD COLUMN "captions" jsonb;--> statement-breakpoint
ALTER TABLE "clip_studio_exports" ADD COLUMN "retention_name" text;--> statement-breakpoint
ALTER TABLE "clip_studio_jobs" ADD COLUMN "clip_min_sec" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_studio_jobs" ADD COLUMN "clip_max_sec" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
CREATE INDEX "clip_studio_retention_owner_idx" ON "clip_studio_retention_videos" USING btree ("installation_id","sub");