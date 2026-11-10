"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Film, Loader2, Settings2, Trash2, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import type { ConfigJson, JobJson } from "@/lib/clip-studio/types";

import { ClipCountSelect, useClipCount } from "./clip-count";
import { clock, JobView } from "./job-view";
import { useClipApi, useUploadVideo } from "./use-clip-api";

const configured = (config: ConfigJson) => config.hasAssemblyAiKey;

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning,"
    : hour < 18
      ? "Good afternoon,"
      : "Good evening,";
};

/**
 * Whether the services panel under the nav is open, remembered in this
 * browser. Closed by default; Escape closes it.
 */
/** Top navigation; the active pill slides between tabs. */
function UploadTile({
  clipCount,
  onUploaded,
}: {
  clipCount: number;
  onUploaded: (job: JobJson) => void;
}) {
  const upload = useUploadVideo();
  const api = useClipApi();
  const [progress, setProgress] = useState<number | null>(null);

  async function send(file: File) {
    setProgress(0);
    try {
      const job = await upload(file, setProgress);
      onUploaded(job);
      // Transcription starts right away; its checks may refuse it, and the
      // job view then offers a retry.
      try {
        await api(`/api/clip-studio/jobs/${job.id}/transcribe`, {
          method: "POST",
          body: JSON.stringify({ clipCount }),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
      onUploaded(job);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress !== null;
  return (
    <motion.label
      whileHover={uploading ? undefined : { y: -2 }}
      whileTap={uploading ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "bg-muted/70 hover:bg-accent focus-within:ring-ring/50 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl px-4 py-8 text-center transition-colors focus-within:ring-[3px]",
        uploading && "pointer-events-none"
      )}
    >
      <span className="bg-card grid size-12 place-items-center rounded-full border shadow-xs">
        {uploading ? (
          <Loader2 className="text-primary size-5 animate-spin" />
        ) : (
          <Upload className="size-5" />
        )}
      </span>
      <span className="font-medium">
        {uploading
          ? `Uploading… ${Math.round((progress ?? 0) * 100)}%`
          : "Upload a long video"}
      </span>
      {uploading ? (
        <Progress value={(progress ?? 0) * 100} className="h-1.5 max-w-60" />
      ) : (
        <span className="text-muted-foreground text-xs">
          MP4, MOV, MKV or anything ffmpeg reads
        </span>
      )}
      <input
        type="file"
        accept="video/*"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void send(file);
        }}
      />
    </motion.label>
  );
}

function StudioPanel({ config }: { config: ConfigJson }) {
  const api = useClipApi();
  const [jobs, setJobs] = useState<JobJson[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [clipCount, setClipCount] = useClipCount();

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await api<JobJson[]>("/api/clip-studio/jobs"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [api]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function remove(jobId: string) {
    try {
      await api(`/api/clip-studio/jobs/${jobId}`, { method: "DELETE" });
      if (selected === jobId) setSelected(null);
      await loadJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!configured(config) ? (
        <Card className="border-primary/30 bg-brand-soft/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
            Add your AssemblyAI key in Settings before clipping.
            <Button size="sm" asChild>
              <Link href="/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <>
        <Card>
          <CardHeader>
            <CardTitle>Quick access</CardTitle>
            <CardDescription>
              Upload once: it is transcribed, then the agent picks the best
              moments.
            </CardDescription>
            <div className="flex items-center gap-2 pt-2 text-sm">
              <span className="text-muted-foreground">Find up to</span>
              <ClipCountSelect value={clipCount} onChange={setClipCount} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <UploadTile
              clipCount={clipCount}
              onUploaded={(job) => {
                setSelected(job.id);
                void loadJobs();
              }}
            />
            <Link
              href="/settings"
              className="bg-muted/70 hover:bg-accent focus-visible:ring-ring/50 flex flex-col items-center justify-center gap-3 rounded-2xl px-4 py-8 text-center transition-colors outline-none focus-visible:ring-[3px]"
            >
              <span className="bg-card grid size-12 place-items-center rounded-full border shadow-xs">
                <Settings2 className="size-5" />
              </span>
              <span className="font-medium">Settings</span>
              <span className="text-muted-foreground text-xs">
                ChatGPT, AssemblyAI
              </span>
            </Link>
          </CardContent>
        </Card>
      </>

      {jobs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your videos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {jobs.map((job) => (
                  <motion.li
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(job.id)}
                      aria-current={selected === job.id ? "true" : undefined}
                      className="hover:bg-accent aria-[current=true]:bg-accent focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px]"
                    >
                      <span className="bg-card grid size-8 shrink-0 place-items-center rounded-full border">
                        <Film className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {job.fileName}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {clock(job.durationSec)}
                      </span>
                      <Badge
                        variant={
                          job.status === "failed" ? "destructive" : "outline"
                        }
                      >
                        {job.status}
                      </Badge>
                    </button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${job.fileName}`}
                      onClick={() => void remove(job.id)}
                    >
                      <Trash2 />
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {selected ? (
        <JobView jobId={selected} config={config} onChanged={loadJobs} />
      ) : null}
    </div>
  );
}

export function ClipStudio() {
  const api = useClipApi();
  const [config, setConfig] = useState<ConfigJson | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api<ConfigJson>("/api/clip-studio/config"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [api]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="theme-studio bg-background text-foreground p-4 sm:p-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div>
            <p className="text-muted-foreground text-sm">{greeting()}</p>
            <p className="text-3xl font-semibold tracking-tight">
              {config?.displayName || "Creator"}
            </p>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Turn one long video into five short clips with captions and
              titles. Upload, pick the moments you like, and the agent edits
              them for you.
            </p>
          </div>
          {config ? (
            <StudioPanel config={config} />
          ) : (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading Clip Studio…
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
