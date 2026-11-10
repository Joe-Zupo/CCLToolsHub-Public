"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  Copy,
  Download,
  Loader2,
  Play,
  RotateCcw,
  Scissors,
} from "lucide-react";
import { motion } from "motion/react";
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
import { Checkbox } from "@repo/ui/components/checkbox";
import { Progress } from "@repo/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

import type {
  ClipExportJson,
  ConfigJson,
  ExportFormat,
  JobJson,
} from "@/lib/clip-studio/types";

import { ClipCountSelect, useClipCount } from "./clip-count";
import { useClipApi } from "./use-clip-api";

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

const STATUS_LABEL: Record<JobJson["status"], string> = {
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  transcribed: "Transcribed",
  analyzing: "Finding clips",
  analyzed: "Clips ready",
  failed: "Failed",
};

const BUSY: JobJson["status"][] = ["transcribing", "analyzing"];

/** shadcn Progress, with a sweeping bar while the stage has no percentage. */
function ProgressBar({ percent }: { percent: number | null }) {
  if (percent !== null) return <Progress value={percent} className="h-2" />;
  return (
    <div
      className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="bg-primary absolute inset-y-0 w-1/3 rounded-full"
        initial={{ left: "-33%" }}
        animate={{ left: "100%" }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function ExportResult({ entry }: { entry: ClipExportJson }) {
  const src = entry.status === "done" ? entry.url : null;
  // A signed link cannot take extra query parameters, so the browser saves it
  // through the `download` attribute instead of `?download=1`.
  const download = src;

  const copy = (text: string) =>
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied"));

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row">
      {src ? (
        <video
          src={src}
          controls
          preload="metadata"
          className={
            entry.format === "vertical"
              ? "aspect-[9/16] w-full rounded-md bg-black sm:w-40"
              : "aspect-video w-full rounded-md bg-black sm:w-64"
          }
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant={entry.status === "failed" ? "destructive" : "secondary"}
          >
            {entry.status}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {entry.format}
            {entry.start !== null && entry.end !== null
              ? ` · ${clock(entry.start)}–${clock(entry.end)}`
              : null}
          </span>
        </div>
        {entry.title ? <p className="font-medium">{entry.title}</p> : null}
        {entry.caption ? (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {entry.caption}
          </p>
        ) : null}
        {entry.error ? (
          <p className="text-destructive text-sm break-words">{entry.error}</p>
        ) : null}
        {entry.status === "done" ? (
          <div className="flex flex-wrap gap-2">
            {download ? (
              <a
                href={download}
                download={`${entry.title ?? "clip"}.mp4`}
                target="_blank"
                rel="noreferrer"
                className="border-input hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm"
              >
                <Download className="size-4" /> Download
              </a>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copy(`${entry.title ?? ""}\n\n${entry.caption ?? ""}`)
              }
            >
              <Copy /> Copy title and caption
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function JobView({
  jobId,
  config,
  onChanged,
}: {
  jobId: string;
  config: ConfigJson;
  onChanged: () => void;
}) {
  const api = useClipApi();
  const [job, setJob] = useState<JobJson | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>("vertical");
  const [clipCount, setClipCount] = useClipCount();
  const [pending, startTransition] = useTransition();
  const video = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setJob(await api<JobJson>(`/api/clip-studio/jobs/${jobId}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [api, jobId]);

  useEffect(() => {
    setJob(null);
    setPicked(new Set());
    void load();
  }, [jobId, load]);

  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.status === lastStatus.current) return;
    lastStatus.current = job.status;
    onChanged();
  }, [job, onChanged]);

  // Transcription only moves when the job is read, so poll while anything is
  // in flight. Progress arrives the same way.
  const inFlight =
    job !== null &&
    (BUSY.includes(job.status) ||
      job.exports.some(
        (e) => e.status === "editing" || e.status === "rendering"
      ));
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  function run(path: string, body?: unknown) {
    startTransition(async () => {
      try {
        await api(`/api/clip-studio/jobs/${jobId}/${path}`, {
          method: "POST",
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    });
  }

  /** One request per clip, so they render side by side. */
  function exportClips(clipIds: string[]) {
    startTransition(async () => {
      const results = await Promise.allSettled(
        clipIds.map((clipId) =>
          api(`/api/clip-studio/jobs/${jobId}/export`, {
            method: "POST",
            body: JSON.stringify({ clipId, format }),
          })
        )
      );
      const failed = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );
      if (failed)
        toast.error(
          failed.reason instanceof Error
            ? failed.reason.message
            : String(failed.reason)
        );
      setPicked(new Set());
      await load();
    });
  }

  function preview(start: number, end: number) {
    const element = video.current;
    if (!element) return;
    element.currentTime = start;
    stopAt.current = end;
    void element.play();
  }

  if (!job) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading job…
        </CardContent>
      </Card>
    );
  }

  const busy = BUSY.includes(job.status);
  const source = job.sourceUrl;
  const exportsDone = job.exports.filter((e) => e.status === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="min-w-0 truncate">{job.fileName}</CardTitle>
            <Badge
              variant={job.status === "failed" ? "destructive" : "secondary"}
            >
              {STATUS_LABEL[job.status]}
            </Badge>
          </div>
          <CardDescription>
            {clock(job.durationSec)} long · uploaded{" "}
            {new Date(job.createdAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {source ? (
            <video
              ref={video}
              src={source}
              controls
              preload="metadata"
              className="aspect-video w-full rounded-md bg-black"
              onTimeUpdate={(event) => {
                if (
                  stopAt.current !== null &&
                  event.currentTarget.currentTime >= stopAt.current
                ) {
                  event.currentTarget.pause();
                  stopAt.current = null;
                }
              }}
            />
          ) : (
            <p className="bg-muted text-muted-foreground rounded-md px-3 py-6 text-center text-sm">
              The uploaded video was deleted 7 days after upload. Your clips
              stay for 30 days after they are made.
            </p>
          )}

          {busy && job.progress ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{job.progress.message}</span>
                {job.progress.percent !== null ? (
                  <span className="text-muted-foreground tabular-nums">
                    {job.progress.percent}%
                  </span>
                ) : null}
              </div>
              <ProgressBar percent={job.progress.percent} />
            </div>
          ) : null}

          {job.error ? (
            <p role="alert" className="text-destructive text-sm break-words">
              {job.error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {job.status === "uploaded" || job.status === "failed" ? (
              <Button
                onClick={() => run("transcribe", { clipCount })}
                disabled={pending}
              >
                {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                {job.status === "failed" ? "Retry transcription" : "Transcribe"}
              </Button>
            ) : null}
            {job.status === "uploaded" ||
            job.status === "failed" ||
            job.status === "transcribed" ||
            job.status === "analyzed" ? (
              <ClipCountSelect
                value={clipCount}
                onChange={setClipCount}
                disabled={pending}
              />
            ) : null}
            {job.status === "transcribed" || job.status === "analyzed" ? (
              <Button
                variant={job.status === "analyzed" ? "outline" : "default"}
                onClick={() => run("analyze", { clipCount })}
                disabled={pending}
              >
                {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                {job.status === "analyzed" ? "Find clips again" : "Find clips"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {job.candidates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Clips</CardTitle>
            <CardDescription>
              Pick the clips to export. The agent tightens each cut and writes
              its title and caption, then it is rendered with captions burned
              in.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {job.candidates.map((clip) => {
                const checked = picked.has(clip.id);
                return (
                  <motion.li
                    key={clip.id}
                    layout
                    whileHover={{ y: -1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3 transition-colors",
                      checked
                        ? "border-primary/60 bg-brand-soft/40"
                        : "hover:bg-accent/40"
                    )}
                  >
                    <Checkbox
                      id={`clip-${clip.id}`}
                      className="mt-1"
                      checked={checked}
                      disabled={busy}
                      onCheckedChange={() =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (checked) next.delete(clip.id);
                          else next.add(clip.id);
                          return next;
                        })
                      }
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label
                        htmlFor={`clip-${clip.id}`}
                        className="flex flex-wrap items-baseline gap-x-2 font-medium"
                      >
                        {clip.title}
                        <span className="text-muted-foreground text-xs font-normal tabular-nums">
                          {clock(clip.start)}–{clock(clip.end)} ·{" "}
                          {Math.round(clip.end - clip.start)}s · score{" "}
                          {clip.score}
                        </span>
                      </label>
                      {clip.hook ? (
                        <p className="text-sm">“{clip.hook}”</p>
                      ) : null}
                      {clip.reason ? (
                        <p className="text-muted-foreground text-xs">
                          {clip.reason}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Preview ${clip.title}`}
                      onClick={() => preview(clip.start, clip.end)}
                    >
                      <Play />
                    </Button>
                  </motion.li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as ExportFormat)}
              >
                <SelectTrigger aria-label="Export format" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical">Vertical 9:16</SelectItem>
                  <SelectItem value="original">Original frame</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => exportClips([...picked])}
                disabled={pending || busy || picked.size === 0}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Scissors />}
                Export {picked.size || ""}{" "}
                {picked.size === 1 ? "clip" : "clips"}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  exportClips(job.candidates.map((clip) => clip.id))
                }
                disabled={pending || busy}
              >
                Export all {job.candidates.length}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {job.exports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Exports</CardTitle>
            <CardDescription>
              {exportsDone} of {job.exports.length} ready
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {job.exports.map((entry) => (
                <ExportResult
                  key={`${entry.clipId}-${entry.format}`}
                  entry={entry}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
