"use client";

import { useCallback, useEffect, useState } from "react";

import localFont from "next/font/local";

import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/utils";

import {
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  DEFAULT_CAPTIONS,
  HIGHLIGHT_COLOR,
  type CaptionFont,
  type CaptionOptions,
} from "@/lib/clip-studio/types";

// The same files the renderer burns in, so the preview matches the clip.
const clean = localFont({
  src: "../../../assets/fonts/DejaVuSans-Bold.ttf",
  display: "swap",
});
const modern = localFont({
  src: "../../../assets/fonts/Poppins-ExtraBold.ttf",
  display: "swap",
});
const impact = localFont({
  src: "../../../assets/fonts/Anton-Regular.ttf",
  display: "swap",
});
const condensed = localFont({
  src: "../../../assets/fonts/BebasNeue-Regular.ttf",
  display: "swap",
});
const comic = localFont({
  src: "../../../assets/fonts/Bangers-Regular.ttf",
  display: "swap",
});

const FONT_CLASS: Record<CaptionFont, string> = {
  clean: clean.className,
  modern: modern.className,
  impact: impact.className,
  condensed: condensed.className,
  comic: comic.className,
};

const STORAGE_KEY = "clip-studio-captions";
const SAMPLE = ["This", "is", "yours"];
const OUTLINE = { WebkitTextStroke: "4px #000", paintOrder: "stroke fill" };

/** The member's last caption choices, remembered in this browser. */
export function useCaptionOptions(): [
  CaptionOptions,
  (options: CaptionOptions) => void,
] {
  const [options, setOptions] = useState(DEFAULT_CAPTIONS);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null"
      ) as Partial<CaptionOptions> | null;
      if (stored && CAPTION_FONTS.some((font) => font.id === stored.font))
        setOptions({ ...DEFAULT_CAPTIONS, ...stored });
    } catch {
      // Storage blocked or unreadable; keep the defaults.
    }
  }, []);
  const choose = useCallback((next: CaptionOptions) => {
    setOptions(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; still used for this export.
    }
  }, []);
  return [options, choose];
}

/** The captions as they will look, stepping through the words when highlighted. */
function CaptionPreview({
  font,
  highlight,
  position,
}: Omit<CaptionOptions, "enabled">) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!highlight) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setActive((word) => (word + 1) % SAMPLE.length),
      550
    );
    return () => window.clearInterval(timer);
  }, [highlight]);

  return (
    <div
      aria-hidden
      className={cn(
        "flex h-44 justify-center rounded-xl bg-black/90 px-4 py-5 text-center text-3xl text-white",
        { high: "items-start", middle: "items-center", low: "items-end" }[
          position
        ],
        FONT_CLASS[font]
      )}
    >
      <p style={OUTLINE}>
        {SAMPLE.map((word, i) => (
          <span
            key={word}
            className="transition-colors duration-100"
            style={
              highlight && i === active ? { color: HIGHLIGHT_COLOR } : undefined
            }
          >
            {word}
            {i < SAMPLE.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

/** Whether clips get captions, in which font, and with the spoken word lit up. */
export function CaptionSettings({
  value,
  onChange,
  disabled,
}: {
  value: CaptionOptions;
  onChange: (options: CaptionOptions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="captions-on"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({ ...value, enabled: checked === true })
          }
        />
        <Label htmlFor="captions-on">Add captions to the video</Label>
      </div>

      {value.enabled ? (
        <>
          <div
            role="radiogroup"
            aria-label="Caption font"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          >
            {CAPTION_FONTS.map(({ id, label }) => {
              const active = value.font === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => onChange({ ...value, font: id })}
                  className={cn(
                    "focus-visible:ring-ring/50 flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50",
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "hover:bg-accent"
                  )}
                >
                  <span className={cn("text-2xl leading-none", FONT_CLASS[id])}>
                    Aa
                  </span>
                  <span className="text-muted-foreground text-xs">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span id="captions-position" className="text-sm font-medium">
              Position
            </span>
            <div
              role="radiogroup"
              aria-labelledby="captions-position"
              className="bg-muted/60 inline-flex gap-1 rounded-xl p-1"
            >
              {CAPTION_POSITIONS.map(({ id, label }) => {
                const active = value.position === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => onChange({ ...value, position: id })}
                    className={cn(
                      "focus-visible:ring-ring/50 rounded-lg px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50",
                      active
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="captions-highlight"
              checked={value.highlight}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange({ ...value, highlight: checked === true })
              }
            />
            <Label htmlFor="captions-highlight">
              Highlight each word as it is said
            </Label>
          </div>

          <CaptionPreview
            font={value.font}
            highlight={value.highlight}
            position={value.position}
          />
        </>
      ) : null}
    </div>
  );
}
