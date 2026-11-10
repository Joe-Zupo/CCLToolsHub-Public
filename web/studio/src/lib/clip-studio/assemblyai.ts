import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import type { Sentence } from "./agent/clip-agent";
import type { Readiness } from "./types";

/**
 * AssemblyAI, the transcriber. The video goes up once from this computer, and
 * AssemblyAI gives back a private URL to transcribe from. A transcript is
 * started once and then checked on each poll from the browser. AssemblyAI times
 * everything in milliseconds; this module hands back seconds.
 */

const BASE = "https://api.assemblyai.com/v2";

export type Word = { start: number; end: number; text: string };

type ApiError = { error?: string };

const call = async <T>(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: apiKey, ...init.headers },
    // A video can take hours to send. Everything else answers quickly.
    signal: AbortSignal.timeout(path === "/upload" ? 4 * 3_600_000 : 60_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "AssemblyAI rejected the API key."
        : `AssemblyAI said: ${json.error ?? `HTTP ${response.status}`}`
    );
  return json;
};

/**
 * Whether the key works. AssemblyAI has no balance endpoint, so a valid key
 * is as far as the check can go; an account out of credit fails when the
 * transcript is requested, with AssemblyAI's own message.
 */
export async function assemblyAiReady(apiKey: string): Promise<Readiness> {
  if (!apiKey)
    return { ok: false, message: "Add your AssemblyAI key in Settings." };
  try {
    await call(apiKey, "/transcript?limit=1");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Sends a file to AssemblyAI; returns the URL to transcribe it from. */
export async function uploadMedia(
  apiKey: string,
  path: string
): Promise<string> {
  const { upload_url } = await call<{ upload_url: string }>(apiKey, "/upload", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: Readable.toWeb(createReadStream(path)) as ReadableStream,
    duplex: "half",
  } as RequestInit);
  return upload_url;
}

/** Starts a transcript of the media at `mediaUrl`; returns its id. */
export async function startTranscript(
  apiKey: string,
  mediaUrl: string
): Promise<string> {
  const { id } = await call<{ id: string }>(apiKey, "/transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Members may speak Filipino, Taglish or English.
    body: JSON.stringify({
      audio_url: mediaUrl,
      punctuate: true,
      language_detection: true,
    }),
  });
  return id;
}

export type TranscriptState =
  | { status: "queued" | "processing" }
  | { status: "error"; error: string }
  | {
      status: "completed";
      durationSec: number | null;
      sentences: Sentence[];
      words: Word[];
    };

type StatusResponse = {
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  audio_duration?: number | null;
};

type SentencesResponse = {
  sentences: {
    text: string;
    start: number;
    end: number;
    words: { text: string; start: number; end: number }[];
  }[];
};

const seconds = (ms: number) => Math.round(ms) / 1000;

/** One look at a transcript; the sentences come along once it is done. */
export async function checkTranscript(
  apiKey: string,
  transcriptId: string
): Promise<TranscriptState> {
  const state = await call<StatusResponse>(
    apiKey,
    `/transcript/${encodeURIComponent(transcriptId)}`
  );
  if (state.status === "error")
    return { status: "error", error: state.error ?? "Unknown error." };
  if (state.status !== "completed") return { status: state.status };

  const { sentences } = await call<SentencesResponse>(
    apiKey,
    `/transcript/${encodeURIComponent(transcriptId)}/sentences`
  );
  return {
    status: "completed",
    durationSec: state.audio_duration ?? null,
    sentences: sentences.map((s) => ({
      start: seconds(s.start),
      end: seconds(s.end),
      text: s.text,
    })),
    words: sentences.flatMap((s) =>
      s.words.map((w) => ({
        start: seconds(w.start),
        end: seconds(w.end),
        text: w.text,
      }))
    ),
  };
}
