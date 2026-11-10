"use client";

import { AudioLines, Bot, Clapperboard, RefreshCw } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@repo/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import type { PreflightJson, ServiceId } from "@/lib/clip-studio/types";

export const SERVICES: {
  id: ServiceId;
  label: string;
  role: string;
  icon: typeof Bot;
}[] = [
  { id: "agent", label: "ChatGPT", role: "Finds and edits clips", icon: Bot },
  {
    id: "assemblyai",
    label: "AssemblyAI",
    role: "Transcribes",
    icon: AudioLines,
  },
  {
    id: "storage",
    label: "Storage and render",
    role: "Holds videos, renders clips",
    icon: Clapperboard,
  },
];

type ServiceState = "ready" | "blocked" | "unknown";

const serviceState = (
  checks: Partial<PreflightJson> | null,
  id: ServiceId
): ServiceState => {
  const result = checks?.[id];
  return !result ? "unknown" : result.ok ? "ready" : "blocked";
};

function StatusDot({
  state,
  className,
}: {
  state: ServiceState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full",
        state === "ready" && "bg-success",
        state === "blocked" && "bg-primary",
        state === "unknown" && "bg-muted-foreground/40",
        className
      )}
    />
  );
}

/** Compact summary for the nav: one dot and "3/4 ready". */
export function ServicesSummary({
  checks,
}: {
  checks: Partial<PreflightJson> | null;
}) {
  const ready = checks
    ? SERVICES.filter(({ id }) => checks[id]?.ok).length
    : null;
  const state: ServiceState =
    ready === null
      ? "unknown"
      : ready === SERVICES.length
        ? "ready"
        : SERVICES.some(({ id }) => serviceState(checks, id) === "blocked")
          ? "blocked"
          : "unknown";
  return (
    <span className="flex items-center gap-2">
      <StatusDot state={state} className="size-2" />
      <span className="tabular-nums">
        {ready === null ? "Services" : `${ready}/${SERVICES.length} ready`}
      </span>
    </span>
  );
}

/** Service readiness: one tile per service with a status dot. */
export function ServicesPanel({
  checks,
  checking,
  onRefresh,
  className,
}: {
  checks: Partial<PreflightJson> | null;
  checking: boolean;
  onRefresh: () => void;
  className?: string;
}) {
  return (
    <section
      id="clip-studio-services"
      aria-label="Services"
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Services
        </h2>
        <Button
          size="xs"
          variant="ghost"
          onClick={onRefresh}
          disabled={checking}
          className="text-muted-foreground"
        >
          <RefreshCw className={cn(checking && "animate-spin")} />
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {SERVICES.map(({ id, label, role, icon: Icon }, i) => {
          const result = checks?.[id];
          const state = serviceState(checks, id);
          return (
            <motion.li
              key={id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.04 + i * 0.04,
                duration: 0.22,
                ease: "easeOut",
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className={cn(
                      "bg-card hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors outline-none focus-visible:ring-[3px]",
                      state === "blocked" && "border-primary/40"
                    )}
                  >
                    <span className="bg-muted relative grid size-8 shrink-0 place-items-center rounded-full">
                      <Icon className="size-4" />
                      <StatusDot
                        state={state}
                        className="ring-card absolute -right-0.5 -bottom-0.5 size-3 ring-2"
                      />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          "truncate text-sm font-medium",
                          state === "blocked" && "text-primary"
                        )}
                      >
                        {label}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {role}
                      </span>
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64">
                  {!result
                    ? "Not checked yet."
                    : result.ok
                      ? `${label} is ready.`
                      : result.message}
                </TooltipContent>
              </Tooltip>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
