"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  Clapperboard,
  GraduationCap,
  Heart,
  Layers,
  LayoutDashboard,
  Library,
  Lightbulb,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Settings2,
  FileText,
  Shield,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@repo/ui/lib/utils";

type RoomState = {
  type: "script-room-state";
  room: "tof" | "mof";
  agent: string;
  busy: boolean;
  sections: {
    label: string;
    count: string;
    current: boolean;
    disabled: boolean;
  }[];
};

type RoomCommand =
  | { action: "hello" }
  | { action: "close" }
  | { action: "section"; index: number }
  | { action: "room"; room: "tof" | "mof" }
  | { action: "tool"; id: string };

// In the order the Script Room lists its sections.
const SECTION_ICONS: LucideIcon[] = [
  Lightbulb,
  Bookmark,
  UserRound,
  Library,
  Layers,
  Heart,
];

const COLLAPSED_KEY = "ccl-tools.sidebar-collapsed";

const sendToRoom = (command: RoomCommand) =>
  document
    .querySelector<HTMLIFrameElement>("iframe[data-script-room]")
    ?.contentWindow?.postMessage(
      { type: "script-room-command", ...command },
      window.location.origin
    );

const rowClass = (active: boolean, collapsed: boolean, nested: boolean) =>
  cn(
    "focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-lg text-sm outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
    collapsed ? "size-10 justify-center" : "min-h-9 px-2.5 py-1.5",
    nested && !collapsed && "min-h-8 py-1",
    active
      ? "bg-accent text-foreground font-medium"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
  );

type RowProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed: boolean;
  nested?: boolean;
  count?: string;
  disabled?: boolean;
  href?: string;
  external?: boolean;
  onClick?: () => void;
};

function Row({
  icon: Icon,
  label,
  active = false,
  collapsed,
  nested = false,
  count,
  disabled,
  href,
  external = false,
  onClick,
}: RowProps) {
  const body = (
    <>
      <Icon className={cn("shrink-0", nested ? "size-3.5" : "size-4")} />
      {collapsed ? null : <span className="truncate text-left">{label}</span>}
      {!collapsed && count ? (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  );
  const shared = {
    className: rowClass(active, collapsed, nested),
    title: collapsed ? label : undefined,
    "aria-label": collapsed ? label : undefined,
    "aria-current": active ? ("page" as const) : undefined,
  };
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noreferrer" {...shared}>
        {body}
      </a>
    );
  return href ? (
    <Link href={href} onClick={onClick} {...shared}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} {...shared}>
      {body}
    </button>
  );
}

function RoomSwitch({
  state,
  onPick,
}: {
  state: RoomState;
  onPick: (room: "tof" | "mof") => void;
}) {
  const options = [
    { id: "tof", label: "TOF", title: "Top of funnel: reach new people" },
    {
      id: "mof",
      label: "MOF",
      title: "Middle of funnel: teach and build trust",
    },
  ] as const;
  return (
    <div
      role="radiogroup"
      aria-label="Script Room"
      className="bg-muted grid grid-cols-2 gap-0.5 rounded-lg p-0.5"
    >
      {options.map(({ id, label, title }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={state.room === id}
          title={title}
          disabled={state.busy}
          onClick={() => onPick(id)}
          className={cn(
            "focus-visible:ring-ring/50 rounded-md py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50",
            state.room === id
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ScriptWriterGroup({
  state,
  collapsed,
  onDone,
}: {
  state: RoomState | null;
  collapsed: boolean;
  onDone: () => void;
}) {
  const run = (command: RoomCommand) => {
    sendToRoom(command);
    onDone();
  };
  if (!state)
    return collapsed ? null : (
      <div className="grid gap-2 py-1" aria-hidden="true">
        <div className="bg-muted h-7 animate-pulse rounded-lg motion-reduce:animate-none" />
        <div className="bg-muted h-7 animate-pulse rounded-lg motion-reduce:animate-none" />
      </div>
    );
  const tools = [
    { id: "teachBtn", label: `Teach ${state.agent}`, icon: GraduationCap },
    { id: "dataBtn", label: "Your data", icon: Shield },
  ];
  return (
    <div className="grid gap-0.5">
      {collapsed ? null : (
        <div className="grid gap-2 pb-2">
          <RoomSwitch
            state={state}
            onPick={(room) => run({ action: "room", room })}
          />
        </div>
      )}
      <Row
        icon={Plus}
        label="New script"
        collapsed={collapsed}
        nested
        disabled={state.busy}
        onClick={() => run({ action: "tool", id: "newBtn" })}
      />
      {state.sections.map((section, index) => (
        <Row
          key={index}
          icon={SECTION_ICONS[index] ?? FileText}
          label={section.label}
          count={section.count}
          active={section.current}
          disabled={section.disabled}
          collapsed={collapsed}
          nested
          onClick={() => run({ action: "section", index })}
        />
      ))}
      <div className={cn("my-1.5 border-t", collapsed && "mx-2")} />
      {tools.map(({ id, label, icon }) => (
        <Row
          key={id}
          icon={icon}
          label={label}
          collapsed={collapsed}
          nested
          onClick={() => run({ action: "tool", id })}
        />
      ))}
    </div>
  );
}

function Group({
  open,
  collapsed,
  children,
}: {
  open: boolean;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "py-1.5",
              collapsed
                ? "grid justify-items-center"
                : "ml-[1.15rem] border-l pl-2"
            )}
          >
            {children}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SidebarBody({
  collapsed,
  room,
  onNavigate,
}: {
  collapsed: boolean;
  room: RoomState | null;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const inScript = pathname === "/script-writer";
  return (
    <nav aria-label="Main" className="grid content-start gap-1">
      <Row
        href="/"
        icon={LayoutDashboard}
        label="Dashboard"
        active={pathname === "/"}
        collapsed={collapsed}
        onClick={onNavigate}
      />
      <Row
        href="/script-writer"
        icon={PenLine}
        label="Script Writer"
        active={inScript && !room?.sections.some((s) => s.current)}
        collapsed={collapsed}
        onClick={() => {
          sendToRoom({ action: "close" });
          onNavigate();
        }}
      />
      <Group open={inScript} collapsed={collapsed}>
        <ScriptWriterGroup
          state={room}
          collapsed={collapsed}
          onDone={onNavigate}
        />
      </Group>
      <Row
        href="/clip-studio"
        icon={Clapperboard}
        label="Clip Studio"
        active={pathname === "/clip-studio"}
        collapsed={collapsed}
        onClick={onNavigate}
      />
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Clipscript Studio dashboard"
      className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg outline-none focus-visible:ring-[3px]"
    >
      <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold">
        CS
      </span>
      {collapsed ? null : <span className="font-semibold">Studio</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Storage can be blocked, so a failed read just leaves the sidebar open.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === "1")
        setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    const listen = (event: MessageEvent<RoomState>) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "script-room-state"
      )
        setRoom(event.data);
    };
    window.addEventListener("message", listen);
    sendToRoom({ action: "hello" });
    return () => window.removeEventListener("message", listen);
  }, []);

  // A panel left open in the Script Room should not be waiting on return.
  useEffect(() => {
    if (pathname !== "/script-writer") sendToRoom({ action: "close" });
  }, [pathname]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  const footer = (isCollapsed: boolean, onClick?: () => void) => (
    <>
      <Row
        href="/settings"
        icon={Settings2}
        label="Settings"
        active={pathname === "/settings"}
        collapsed={isCollapsed}
        onClick={onClick}
      />
      <Row
        href="/privacy"
        icon={Shield}
        label="Privacy"
        active={pathname === "/privacy"}
        collapsed={isCollapsed}
        onClick={onClick}
      />
    </>
  );

  const title =
    pathname === "/script-writer"
      ? "Script Writer"
      : pathname === "/clip-studio"
        ? "Clip Studio"
        : pathname === "/settings"
          ? "Settings"
          : "Dashboard";

  return (
    <>
      <div className="bg-background/90 sticky top-0 z-20 flex h-12 items-center gap-2 border-b px-2 backdrop-blur md:hidden">
        <button
          ref={menuButton}
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="focus-visible:ring-ring/50 grid size-9 place-items-center rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Menu className="size-5" />
        </button>
        <span className="truncate text-sm font-medium">{title}</span>
      </div>

      <AnimatePresence>
        {drawerOpen ? (
          <motion.div
            className="fixed inset-0 z-30 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={closeDrawer}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="bg-sidebar relative flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r p-3"
            >
              <div className="flex items-center justify-between">
                <Brand collapsed={false} />
                <button
                  ref={closeButton}
                  type="button"
                  aria-label="Close menu"
                  onClick={closeDrawer}
                  className="focus-visible:ring-ring/50 grid size-9 place-items-center rounded-lg outline-none focus-visible:ring-[3px]"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarBody
                collapsed={false}
                room={room}
                onNavigate={() => setDrawerOpen(false)}
              />
              <div className="mt-auto grid gap-2">
                {footer(false, () => setDrawerOpen(false))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <aside
        className={cn(
          "bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 overflow-y-auto border-r p-3 transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
          collapsed ? "w-16 items-center" : "w-60"
        )}
      >
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "justify-between px-1"
          )}
        >
          <Brand collapsed={collapsed} />
        </div>
        <SidebarBody
          collapsed={collapsed}
          room={room}
          onNavigate={() => undefined}
        />
        <div className="mt-auto grid gap-1">
          {footer(collapsed)}
          <Row
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            collapsed={collapsed}
            onClick={toggleCollapsed}
          />
        </div>
      </aside>
    </>
  );
}
