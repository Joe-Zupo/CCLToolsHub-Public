"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

const THEME_KEY = "ccl-tools.theme";
const THEME_EVENT = "ccl-tools-theme";

const OPTIONS: { id: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
];

function storedChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme() {
  const choice = storedChoice();
  const theme =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector<HTMLIFrameElement>("iframe[data-script-room]")
    ?.contentWindow?.postMessage(
      { type: "script-room-command", action: "theme", theme },
      window.location.origin
    );
}

/** Keeps the page and the Script Room on the chosen theme, on every page. */
export function ThemeSync() {
  useEffect(() => {
    applyTheme();
    const onRoom = (event: MessageEvent<{ type?: string }>) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "script-room-state"
      )
        applyTheme();
    };
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", applyTheme);
    window.addEventListener(THEME_EVENT, applyTheme);
    window.addEventListener("message", onRoom);
    return () => {
      query.removeEventListener("change", applyTheme);
      window.removeEventListener(THEME_EVENT, applyTheme);
      window.removeEventListener("message", onRoom);
    };
  }, []);
  return null;
}

/** Light, dark, or whatever the computer is set to. */
export function ThemeControl() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(storedChoice());
  }, []);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-muted grid grid-cols-3 gap-0.5 rounded-lg p-0.5"
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={choice === id}
          onClick={() => pick(id)}
          className={cn(
            "focus-visible:ring-ring/50 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors outline-none focus-visible:ring-[3px]",
            choice === id
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
