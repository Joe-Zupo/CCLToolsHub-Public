"use client";

import { useCallback } from "react";

import { readError } from "@/lib/api";
import type { JobJson, RetentionVideoJson } from "@/lib/clip-studio/types";

/** JSON calls to the Clip Studio API, throwing the server's error message. */
export function useClipApi() {
  return useCallback(async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    });
    if (!response.ok) throw new Error(await readError(response));
    if (response.status === 204) return undefined as T;
    return ((await response.json()) as { data: T }).data;
  }, []);
}

/** The video's length in seconds, read by the browser from its metadata. */
const readDuration = (file: File) =>
  new Promise<number>((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : 1);
    video.onerror = () => done(1);
    video.src = url;
  });

/** XMLHttpRequest, because `fetch` cannot report upload progress. */
const sendFile = (file: File, onProgress: (fraction: number) => void) =>
  new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/clip-studio/upload?name=${encodeURIComponent(file.name)}`
    );
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error("The upload did not finish."));
    request.onload = () => {
      const body = request.response as {
        data?: { name: string };
        error?: string;
      } | null;
      if (request.status === 201 && body?.data) resolve(body.data.name);
      else reject(new Error(body?.error ?? "The upload did not finish."));
    };
    request.send(file);
  });

const saveFile = async (file: File, onProgress: (fraction: number) => void) => {
  const [durationSec, name] = await Promise.all([
    readDuration(file),
    sendFile(file, onProgress),
  ]);
  return { name, fileName: file.name, durationSec };
};

/** Saves a video to this computer, then registers it as a job. */
export function useUploadVideo() {
  const api = useClipApi();
  return useCallback(
    async (file: File, onProgress: (fraction: number) => void) =>
      api<JobJson>("/api/clip-studio/jobs", {
        method: "POST",
        body: JSON.stringify(await saveFile(file, onProgress)),
      }),
    [api]
  );
}

/** Saves a video to this computer and adds it to the retention videos. */
export function useUploadRetentionVideo() {
  const api = useClipApi();
  return useCallback(
    async (file: File, onProgress: (fraction: number) => void) =>
      api<RetentionVideoJson>("/api/clip-studio/retention", {
        method: "POST",
        body: JSON.stringify(await saveFile(file, onProgress)),
      }),
    [api]
  );
}
