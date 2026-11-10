"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@repo/ui/lib/utils";

/**
 * The Script Room, framed so its stylesheet and script run as exported. It
 * stays mounted once opened, so leaving for Clip Studio does not end an
 * interview.
 */
export function ScriptRoomFrame() {
  const active = usePathname() === "/script-writer";
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <iframe
      data-script-room
      src="/script-room"
      title="Script Writer"
      allow="microphone; clipboard-write"
      className={cn(
        "block h-[calc(100dvh-3rem)] w-full border-0 md:h-dvh",
        !active && "hidden"
      )}
    />
  );
}
