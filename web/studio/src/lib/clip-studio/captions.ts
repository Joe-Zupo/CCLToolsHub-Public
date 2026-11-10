import type { CaptionFont, CaptionOptions, CaptionPosition } from "./types";
import { HIGHLIGHT_COLOR } from "./types";

/**
 * Burned-in captions as an ASS subtitle file: a few words at a time, the way
 * short-form captions read, timed from the clip's own start. With highlighting
 * on, each word gets its own event, so the word being said changes colour while
 * the rest of its group stays on screen.
 */

export type CaptionWord = { start: number; end: number; text: string };
export type VideoSize = { width: number; height: number };

/** Family names as written inside the bundled files in `assets/fonts`. */
const FONTS: Record<
  CaptionFont,
  { family: string; bold: boolean; scale: number }
> = {
  clean: { family: "DejaVu Sans", bold: true, scale: 0.85 },
  modern: { family: "Poppins ExtraBold", bold: false, scale: 1 },
  impact: { family: "Anton", bold: false, scale: 1.2 },
  condensed: { family: "Bebas Neue", bold: false, scale: 1.35 },
  comic: { family: "Bangers", bold: false, scale: 1.25 },
};

const MAX_WORDS = 3;
const MAX_GAP_SEC = 0.8;

/** "#RRGGBB" as ASS writes it: &HBBGGRR&. */
const assColor = (hex: string) => {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  return `&H${b}${g}${r}&`.toUpperCase();
};

const assTime = (seconds: number) => {
  const cs = Math.max(0, Math.round(seconds * 100));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(cs / 360_000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
};

/** Transcript text is untrusted: override tags must not reach the renderer. */
const clean = (text: string) =>
  text
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const dialogue = (from: number, to: number, text: string) =>
  `Dialogue: 0,${assTime(from)},${assTime(to)},Default,,0,0,0,,${text}`;

export function captionsAss(
  words: CaptionWord[],
  start: number,
  end: number,
  {
    font,
    highlight,
    position = "low",
  }: Pick<CaptionOptions, "font" | "highlight"> & {
    position?: CaptionPosition;
  },
  { width, height }: VideoSize
): string {
  const { family, bold, scale } = FONTS[font];
  const tall = height > width;
  const size = Math.round(
    Math.min(width, height) * (tall ? 0.1 : 0.07) * scale
  );
  const outline = Math.max(2, Math.round(size * 0.09));
  // Clear of the buttons short-form apps draw over the bottom of a tall video.
  const alignment = { high: 8, middle: 5, low: 2 }[position];
  const marginV =
    position === "middle"
      ? 0
      : Math.round(height * (position === "high" ? 0.12 : tall ? 0.2 : 0.08));
  const marginH = Math.round(width * 0.06);

  const groups: CaptionWord[][] = [];
  for (const word of words) {
    if (word.end <= start || word.start >= end) continue;
    const group = groups.at(-1);
    const gap = group ? word.start - group.at(-1)!.end : Infinity;
    if (!group || group.length >= MAX_WORDS || gap > MAX_GAP_SEC)
      groups.push([word]);
    else group.push(word);
  }

  const at = (seconds: number) =>
    Math.min(Math.max(seconds, start), end) - start;
  const events = groups.flatMap((group) => {
    const texts = group.map((word) => clean(word.text));
    if (!highlight)
      return [
        dialogue(at(group[0]!.start), at(group.at(-1)!.end), texts.join(" ")),
      ];
    return group.map((word, i) =>
      dialogue(
        at(word.start),
        // Held until the next word, so the group never flickers between words.
        at(group[i + 1]?.start ?? word.end),
        texts
          .map((text, j) =>
            j === i ? `{\\c${assColor(HIGHLIGHT_COLOR)}}${text}{\\r}` : text
          )
          .join(" ")
      )
    );
  });

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${family},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,${bold ? -1 : 0},0,0,0,100,100,0,0,1,${outline},0,${alignment},${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

/**
 * The picture size from `ffmpeg -i` output, as it will be displayed: ffmpeg
 * turns a rotated phone video upright when it renders. 16:9 when it cannot tell.
 */
export function videoSize(ffmpegOutput: string): VideoSize {
  const found = /Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(ffmpegOutput);
  if (!found) return { width: 1920, height: 1080 };
  const [width, height] = [Number(found[1]), Number(found[2])];
  return /rotation of -?(90|270)(\.0+)? degrees/.test(ffmpegOutput)
    ? { width: height, height: width }
    : { width, height };
}
