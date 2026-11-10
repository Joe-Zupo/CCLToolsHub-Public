import { randomUUID } from "node:crypto";

import { z } from "zod";

import { lengthLabel } from "../types";
import { AgentError, type Agent, type Readiness } from "./types";

/**
 * What Clip Studio asks of an Agent, and how it reads the answers. The Agent
 * returns free text; everything here treats that text as untrusted: it pulls
 * out the JSON, drops what does not parse, and pins every cut to a sentence
 * boundary inside the video, so a clip never starts or ends mid-word.
 */

/** Seconds. */
export type Sentence = { start: number; end: number; text: string };

export type ClipCandidate = {
  id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
};

export type ClipEdit = {
  start: number;
  end: number;
  title: string;
  caption: string;
};

/** Roughly four characters to a token, which is close enough for English. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function checkBudget(agent: Agent, prompt: string): Readiness {
  const tokens = estimateTokens(prompt);
  if (tokens <= agent.maxInputTokens) return { ok: true };
  return {
    ok: false,
    message: `The transcript is too long for ${agent.label}: about ${tokens.toLocaleString()} tokens against a limit of ${agent.maxInputTokens.toLocaleString()}. Try a shorter video.`,
  };
}

const stamp = (seconds: number) => seconds.toFixed(1);
const transcriptLines = (sentences: Sentence[]) =>
  sentences
    .map(({ start, end, text }) => `[${stamp(start)}-${stamp(end)}] ${text}`)
    .join("\n");

/** The first JSON object in `text`, whether bare, fenced or wrapped in prose. */
export function extractJson(text: string): unknown {
  const attempts = [
    text,
    /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1],
    text.includes("{")
      ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
      : undefined,
  ];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // Try the next shape.
    }
  }
  return undefined;
}

/**
 * Pins [start, end] to sentence boundaries within [low, high]: start moves to
 * the start of the sentence it falls in, end to the end of the sentence it
 * falls in, and neither may leave the window. Null when nothing is left.
 */
function snap(
  start: number,
  end: number,
  sentences: Sentence[],
  low: number,
  high: number
): { start: number; end: number } | null {
  const from = Math.max(start, low);
  const to = Math.min(end, high);
  if (!(to > from)) return null;
  const inWindow = sentences.filter((s) => s.start >= low && s.end <= high);
  if (inWindow.length === 0) return { start: from, end: to };
  const snappedStart =
    [...inWindow].reverse().find((s) => s.start <= from + 0.5)?.start ??
    inWindow[0]!.start;
  const snappedEnd =
    inWindow.find((s) => s.end >= to - 0.5)?.end ?? inWindow.at(-1)!.end;
  return snappedEnd > snappedStart
    ? { start: snappedStart, end: snappedEnd }
    : null;
}

/** Sentences rarely end on the exact second, so a cut may miss by this much. */
const LENGTH_GRACE_SEC = 2;

/**
 * Holds a cut to the chosen length, always on sentence boundaries. One over the
 * maximum ends at the last sentence that fits. One under the minimum grows by
 * whole neighbouring sentences, if the agent asked for at least half the
 * minimum (`askedSec`, before snapping).
 * Null when it still misses the range by more than `LENGTH_GRACE_SEC`.
 */
function fitLength(
  bounds: { start: number; end: number },
  askedSec: number,
  sentences: Sentence[],
  minSec: number,
  maxSec: number
): { start: number; end: number } | null {
  const length = ({ start, end }: { start: number; end: number }) =>
    end - start;
  let cut = bounds;
  if (length(cut) > maxSec) {
    const latest = cut.start + maxSec;
    const end = sentences.length
      ? sentences.filter((s) => s.end > cut.start && s.end <= latest).at(-1)
          ?.end
      : latest;
    if (end !== undefined && end - cut.start >= minSec - LENGTH_GRACE_SEC)
      cut = { start: cut.start, end };
  }
  if (length(cut) < minSec && askedSec >= minSec / 2) {
    for (const next of sentences.filter((s) => s.start >= cut.end)) {
      if (length(cut) >= minSec || next.end - cut.start > maxSec) break;
      cut = { start: cut.start, end: next.end };
    }
    for (const previous of sentences
      .filter((s) => s.end <= cut.start)
      .reverse()) {
      if (length(cut) >= minSec || cut.end - previous.start > maxSec) break;
      cut = { start: previous.start, end: cut.end };
    }
  }
  return length(cut) >= minSec - LENGTH_GRACE_SEC &&
    length(cut) <= maxSec + LENGTH_GRACE_SEC
    ? cut
    : null;
}

const overlap = (a: ClipCandidate, b: ClipCandidate) => {
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return shared / Math.min(a.end - a.start, b.end - b.start);
};

const rawClip = z.object({
  start: z.number().finite(),
  end: z.number().finite(),
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().max(500).catch(""),
  reason: z.string().trim().max(1000).catch(""),
  score: z.number().finite().catch(5),
});

const CLIP_SYSTEM =
  "You are a short-form video editor. You find the moments in long videos that stand alone as gripping clips for TikTok, Reels and Shorts. You answer with JSON only.";

export async function findClips(
  agent: Agent,
  {
    sentences,
    durationSec,
    count = 5,
    minSec = 30,
    maxSec = 180,
  }: {
    sentences: Sentence[];
    durationSec: number;
    count?: number;
    minSec?: number;
    maxSec?: number;
  }
): Promise<ClipCandidate[]> {
  if (durationSec < minSec)
    throw new AgentError(
      "no-clips",
      `This video is ${Math.round(durationSec)} seconds long, shorter than the ${minSec}-second clips you asked for. Choose a shorter clip length.`
    );
  if (sentences.length === 0)
    throw new AgentError(
      "no-clips",
      "There is no speech in this video, so there is nothing to make clips from."
    );
  const prompt = [
    `Below is the transcript of a ${Math.round(durationSec)}-second video, one sentence per line, each with its start and end time in seconds.`,
    `Pick up to ${count} clips most likely to do well as standalone short videos. Each clip must be ${minSec}-${maxSec} seconds, start at the start of a sentence, end at the end of a sentence, make sense without the rest of the video, and open with a strong hook. Clips must not overlap.`,
    `Answer with JSON only, in this shape: {"clips":[{"start":12.3,"end":48.9,"title":"a punchy title under 70 characters","hook":"the opening line that grabs attention","reason":"why this works as a clip","score":8}]}. Score is 1-10, how likely the clip is to perform.`,
    `Return up to ${count} clips, best first. Return fewer rather than weak ones. Write titles, hooks and reasons in the same language as the transcript.`,
    "",
    "TRANSCRIPT",
    transcriptLines(sentences),
  ].join("\n");

  const text = await agent.complete(prompt, { system: CLIP_SYSTEM });
  const json = extractJson(text);
  const list =
    json && typeof json === "object" && "clips" in json
      ? (json as { clips: unknown }).clips
      : json;

  const candidates: ClipCandidate[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const parsed = rawClip.safeParse(item);
    if (!parsed.success || parsed.data.end <= parsed.data.start) continue;
    const bounds = snap(
      parsed.data.start,
      parsed.data.end,
      sentences,
      0,
      durationSec
    );
    const fitted =
      bounds &&
      fitLength(
        bounds,
        parsed.data.end - parsed.data.start,
        sentences,
        minSec,
        maxSec
      );
    if (!fitted) continue;
    candidates.push({
      id: randomUUID().slice(0, 8),
      ...parsed.data,
      ...fitted,
    });
  }

  const kept: ClipCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (kept.length >= count) break;
    if (kept.every((other) => overlap(candidate, other) <= 0.5))
      kept.push(candidate);
  }
  if (kept.length === 0) {
    const range = `${lengthLabel(minSec)} to ${lengthLabel(maxSec)}`;
    const suggested = Array.isArray(list) ? list.length : null;
    throw new AgentError(
      "no-clips",
      suggested === null
        ? `${agent.label}'s answer could not be read. Try again.`
        : suggested === 0
          ? `${agent.label} found no strong moments for clips of ${range}. Try a different clip length.`
          : `${agent.label} suggested ${suggested} ${suggested === 1 ? "clip" : "clips"}, but none could be cut to ${range}. Try a wider clip length.`,
      text.slice(0, 2000)
    );
  }
  return kept.sort((a, b) => a.start - b.start);
}

const rawEdit = z.object({
  start: z.number().finite(),
  end: z.number().finite(),
  title: z.string().trim().min(1).max(100),
  caption: z.string().trim().min(1).max(2200),
});

/** How far the edit may move a picked clip's start or end, in seconds. */
const EDIT_SLACK_SEC = 15;

const EDIT_SYSTEM =
  "You are a short-form video editor preparing one clip for posting. You tighten the cut, write the on-screen title and the post caption. You answer with JSON only.";

/**
 * Asks the Agent to finish one picked clip: a tighter cut, a title and a post
 * caption. The cut may move at most `EDIT_SLACK_SEC` from the pick, is pinned
 * to sentence boundaries and stays within the chosen length. Anything unusable falls back to the pick
 * itself, so exporting never fails because the Agent rambled.
 */
export async function planClipEdit(
  agent: Agent,
  {
    candidate,
    sentences,
    durationSec,
    minSec = 3,
    maxSec = Infinity,
  }: {
    candidate: ClipCandidate;
    sentences: Sentence[];
    durationSec: number;
    minSec?: number;
    maxSec?: number;
  }
): Promise<ClipEdit> {
  const low = Math.max(0, candidate.start - EDIT_SLACK_SEC);
  const high = Math.min(durationSec, candidate.end + EDIT_SLACK_SEC);
  const nearby = sentences.filter((s) => s.end > low && s.start < high);
  const fallback: ClipEdit = {
    start: candidate.start,
    end: candidate.end,
    title: candidate.title,
    caption: candidate.hook || candidate.title,
  };

  const prompt = [
    `A clip was picked from ${stamp(candidate.start)}s to ${stamp(candidate.end)}s, titled "${candidate.title}".`,
    `You may move its start and end by up to ${EDIT_SLACK_SEC} seconds to tighten it: cut slow openings, end on a strong line. Start at a sentence start and end at a sentence end.${Number.isFinite(maxSec) ? ` The clip must stay ${minSec}-${maxSec} seconds long.` : ""}`,
    'Write a title (under 70 characters, shown on screen) and a caption for the post (1-3 short sentences plus 3-5 hashtags), in the same language as the transcript. Answer with JSON only: {"start":0,"end":0,"title":"","caption":""}.',
    "",
    "TRANSCRIPT AROUND THE CLIP",
    transcriptLines(nearby),
  ].join("\n");

  let text: string;
  try {
    text = await agent.complete(prompt, { system: EDIT_SYSTEM });
  } catch (error) {
    if (error instanceof AgentError && error.code === "not-ready") throw error;
    return fallback;
  }
  const parsed = rawEdit.safeParse(extractJson(text));
  if (!parsed.success) return fallback;
  const bounds = snap(parsed.data.start, parsed.data.end, sentences, low, high);
  const fitted =
    bounds &&
    fitLength(
      bounds,
      parsed.data.end - parsed.data.start,
      sentences.filter((s) => s.start >= low && s.end <= high),
      minSec,
      maxSec
    );
  if (!fitted) return fallback;
  return { ...fitted, title: parsed.data.title, caption: parsed.data.caption };
}
