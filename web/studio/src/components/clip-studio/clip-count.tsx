"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { MAX_CLIPS, MIN_CLIPS } from "@/lib/clip-studio/types";

const STORAGE_KEY = "clip-studio-clip-count";
const COUNTS = Array.from(
  { length: MAX_CLIPS - MIN_CLIPS + 1 },
  (_, i) => MIN_CLIPS + i
);

/** The member's last clip count, remembered in this browser; 5 at first. */
export function useClipCount(): [number, (count: number) => void] {
  const [count, setCount] = useState(MAX_CLIPS);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      if (stored >= MIN_CLIPS && stored <= MAX_CLIPS) setCount(stored);
    } catch {
      // Storage blocked; keep the default.
    }
  }, []);
  const choose = useCallback((next: number) => {
    setCount(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Not remembered; still used for this video.
    }
  }, []);
  return [count, choose];
}

export function ClipCountSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (count: number) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger aria-label="How many clips to find" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COUNTS.map((count) => (
          <SelectItem key={count} value={String(count)}>
            {count === 1 ? "1 clip" : `${count} clips`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
