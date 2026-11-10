"use client";

import { useCallback, useEffect, useState } from "react";

import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import {
  DEFAULT_CLIP_SETTINGS,
  lengthLabel,
  MAX_CLIP_SEC,
  MAX_CLIPS,
  MIN_CLIP_RANGE_SEC,
  MIN_CLIP_SEC,
  MIN_CLIPS,
  type ClipSettings,
} from "@/lib/clip-studio/types";

const STORAGE_KEY = "clip-studio-clip-settings";

const COUNTS = Array.from(
  { length: MAX_CLIPS - MIN_CLIPS + 1 },
  (_, i) => MIN_CLIPS + i
);
const LENGTHS = [MIN_CLIP_SEC, 45, 60, 90, 120, 150, MAX_CLIP_SEC];

const isValid = (value: Partial<ClipSettings> | null): value is ClipSettings =>
  !!value &&
  COUNTS.includes(value.clipCount ?? 0) &&
  LENGTHS.includes(value.minSec ?? 0) &&
  LENGTHS.includes(value.maxSec ?? 0) &&
  value.maxSec! - value.minSec! >= MIN_CLIP_RANGE_SEC;

/** The member's last clip settings, remembered in this browser. */
export function useClipSettings(): [
  ClipSettings,
  (settings: ClipSettings) => void,
] {
  const [settings, setSettings] = useState(DEFAULT_CLIP_SETTINGS);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null"
      ) as Partial<ClipSettings> | null;
      if (isValid(stored)) setSettings(stored);
    } catch {
      // Storage blocked or unreadable; keep the defaults.
    }
  }, []);
  const choose = useCallback((next: ClipSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; still used for this video.
    }
  }, []);
  return [settings, choose];
}

function Picker({
  id,
  label,
  value,
  options,
  format,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  options: number[];
  format: (option: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {format(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** How many clips to find and how long each may be. */
export function ClipSettingsFields({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: ClipSettings;
  onChange: (settings: ClipSettings) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Picker
        id={`${idPrefix}-count`}
        label="Number of clips"
        value={value.clipCount}
        options={COUNTS}
        format={(count) => (count === 1 ? "1 clip" : `${count} clips`)}
        onChange={(clipCount) => onChange({ ...value, clipCount })}
        disabled={disabled}
      />
      <Picker
        id={`${idPrefix}-min`}
        label="Shortest clip"
        value={value.minSec}
        options={LENGTHS.slice(0, -1)}
        format={lengthLabel}
        onChange={(minSec) =>
          onChange({
            ...value,
            minSec,
            maxSec:
              value.maxSec - minSec >= MIN_CLIP_RANGE_SEC
                ? value.maxSec
                : LENGTHS.find(
                    (length) => length - minSec >= MIN_CLIP_RANGE_SEC
                  )!,
          })
        }
        disabled={disabled}
      />
      <Picker
        id={`${idPrefix}-max`}
        label="Longest clip"
        value={value.maxSec}
        options={LENGTHS.slice(1)}
        format={lengthLabel}
        onChange={(maxSec) =>
          onChange({
            ...value,
            maxSec,
            minSec:
              maxSec - value.minSec >= MIN_CLIP_RANGE_SEC
                ? value.minSec
                : LENGTHS.findLast(
                    (length) => maxSec - length >= MIN_CLIP_RANGE_SEC
                  )!,
          })
        }
        disabled={disabled}
      />
    </div>
  );
}
