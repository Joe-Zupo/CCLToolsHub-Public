"use client";

import { useCallback, useEffect, useState } from "react";

import { Ban, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/utils";

import type { RetentionVideoJson } from "@/lib/clip-studio/types";

import { useClipApi, useUploadRetentionVideo } from "./use-clip-api";

const STORAGE_KEY = "clip-studio-retention-video";

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The retention video the member last picked, remembered in this browser. */
export function useRetentionChoice(): [
  string | null,
  (id: string | null) => void,
] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage blocked; start with none.
    }
  }, []);
  const choose = useCallback((next: string | null) => {
    setId(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not remembered; still used for this export.
    }
  }, []);
  return [id, choose];
}

const tile = (active: boolean) =>
  cn(
    "focus-visible:ring-ring/50 flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border p-2 text-center transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50",
    active ? "border-primary/60 bg-primary/10" : "hover:bg-accent"
  );

/** A video to play muted under the clip, like gameplay, picked or uploaded here. */
export function RetentionSettings({
  value,
  onChange,
  available,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  /** False for formats with no room for a second video. */
  available: boolean;
  disabled?: boolean;
}) {
  const api = useClipApi();
  const upload = useUploadRetentionVideo();
  const [videos, setVideos] = useState<RetentionVideoJson[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    void api<RetentionVideoJson[]>("/api/clip-studio/retention")
      .then(setVideos)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error))
      );
  }, [api]);

  // A remembered video may have been deleted or expired since.
  useEffect(() => {
    if (videos && value && !videos.some((video) => video.id === value))
      onChange(null);
  }, [videos, value, onChange]);

  async function add(file: File) {
    setProgress(0);
    try {
      const video = await upload(file, setProgress);
      setVideos((current) => [video, ...(current ?? [])]);
      onChange(video.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/clip-studio/retention/${id}`, { method: "DELETE" });
      setVideos((current) => current?.filter((video) => video.id !== id) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const off = disabled || !available;
  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <Label>Retention video</Label>
        <p className="text-muted-foreground text-xs">
          {available
            ? "Plays muted under the clip, like Subway Surfers or Minecraft parkour. Use footage you have the rights to post."
            : "Needs the Vertical 9:16 format. Switch format below to use one."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Retention video"
        className="grid auto-rows-[7.5rem] grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!value || !available}
          disabled={off}
          onClick={() => onChange(null)}
          className={tile(!value || !available)}
        >
          <Ban className="text-muted-foreground size-5" />
          <span className="text-xs font-medium">None</span>
        </button>

        {videos?.map((video) => {
          const active = available && value === video.id;
          return (
            <div key={video.id} className="relative">
              <button
                type="button"
                role="radio"
                aria-checked={active}
                disabled={off}
                onClick={() => onChange(video.id)}
                className={tile(active)}
              >
                {video.url ? (
                  <video
                    src={video.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="bg-muted h-16 w-full rounded-md object-cover"
                  />
                ) : (
                  <span className="bg-muted h-16 w-full rounded-md" />
                )}
                <span className="w-full truncate text-xs font-medium">
                  {video.fileName}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {clock(video.durationSec)}
                </span>
              </button>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                aria-label={`Delete ${video.fileName}`}
                disabled={disabled}
                onClick={() => void remove(video.id)}
                className="absolute top-1 right-1"
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}

        <label
          className={cn(
            tile(false),
            "focus-within:ring-ring/50 cursor-pointer border-dashed focus-within:ring-[3px]",
            (off || uploading) && "pointer-events-none opacity-50"
          )}
        >
          {uploading ? (
            <Loader2 className="text-primary size-5 animate-spin" />
          ) : (
            <Plus className="size-5" />
          )}
          <span className="text-xs font-medium">
            {uploading
              ? `Uploading… ${Math.round((progress ?? 0) * 100)}%`
              : "Add a video"}
          </span>
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            disabled={off || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void add(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
