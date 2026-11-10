"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import { checkKeyFormats } from "@/lib/clip-studio/key-format";
import type { ConfigJson, PreflightJson } from "@/lib/clip-studio/types";

import { ChatGptConnection } from "./chatgpt-connection";
import { ServicesPanel } from "./clip-studio/services";
import { useClipApi } from "./clip-studio/use-clip-api";
import { ThemeControl } from "./theme-control";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function DeleteClips() {
  const api = useClipApi();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      try {
        await api("/api/clip-studio/me", { method: "DELETE" });
        setConfirming(false);
        toast.success("Your Clip Studio data is deleted.");
      } catch (error) {
        toast.error(message(error));
      }
    });

  return confirming ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="destructive" onClick={remove} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Yes, delete everything
      </Button>
      <Button
        variant="outline"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Cancel
      </Button>
    </div>
  ) : (
    <Button
      variant="outline"
      className="self-start"
      onClick={() => setConfirming(true)}
    >
      <Trash2 /> Delete Clip Studio data
    </Button>
  );
}

export function SettingsView() {
  const api = useClipApi();
  const [config, setConfig] = useState<ConfigJson | null>(null);
  const [checks, setChecks] = useState<Partial<PreflightJson> | null>(null);
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState("");
  const [assemblyKey, setAssemblyKey] = useState("");
  const [keyProblem, setKeyProblem] = useState<string>();
  const [saving, startSaving] = useTransition();

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setChecks(await api<PreflightJson>("/api/clip-studio/preflight"));
    } catch (error) {
      toast.error(message(error));
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api<ConfigJson>("/api/clip-studio/config");
        setConfig(loaded);
        setName(loaded.displayName);
      } catch (error) {
        toast.error(message(error));
      }
    })();
    void check();
  }, [api, check]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const update = { displayName: name, assemblyAiKey: assemblyKey };
    const problem = checkKeyFormats(update).assemblyAiKey;
    setKeyProblem(problem);
    if (problem) return;
    startSaving(async () => {
      try {
        setConfig(
          await api<ConfigJson>("/api/clip-studio/config", {
            method: "PUT",
            body: JSON.stringify(update),
          })
        );
        setAssemblyKey("");
        toast.success("Saved");
        void check();
      } catch (error) {
        toast.error(message(error));
      }
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 sm:p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

          <ChatGptConnection onChange={() => void check()} />

          <Card>
            <CardHeader>
              <CardTitle>Connections</CardTitle>
              <CardDescription>
                Whether each service is ready to use.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ServicesPanel
                checks={checks}
                checking={checking}
                onRefresh={() => void check()}
              />
            </CardContent>
          </Card>

          <form onSubmit={save} className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>AssemblyAI key</CardTitle>
                <CardDescription>
                  Clip Studio uses this to transcribe your videos. It is
                  encrypted and stays on this computer.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Label htmlFor="assembly-key">API key</Label>
                <Input
                  id="assembly-key"
                  type="password"
                  autoComplete="off"
                  value={assemblyKey}
                  aria-invalid={Boolean(keyProblem)}
                  onChange={(event) => setAssemblyKey(event.target.value)}
                  placeholder={
                    config?.hasAssemblyAiKey
                      ? "Saved. Type to replace."
                      : "Paste your key"
                  }
                />
                {keyProblem ? (
                  <p className="text-destructive text-sm">{keyProblem}</p>
                ) : null}
                <a
                  href="https://www.assemblyai.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground inline-flex items-center gap-1 self-start text-sm underline"
                >
                  Get a key <ExternalLink className="size-3" />
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your name</CardTitle>
                <CardDescription>
                  Shown when you open Clip Studio.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Label htmlFor="display-name">Name</Label>
                <Input
                  id="display-name"
                  value={name}
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                />
              </CardContent>
            </Card>

            <Button
              type="submit"
              size="lg"
              className="self-start"
              disabled={saving || !config}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </form>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="max-w-56">
              <ThemeControl />
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Delete Clip Studio data</CardTitle>
              <CardDescription>
                Removes your AssemblyAI key, name, uploaded videos and finished
                clips. This cannot be undone. Script Writer&apos;s data is under
                Your data in Script Writer.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              <DeleteClips />
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
