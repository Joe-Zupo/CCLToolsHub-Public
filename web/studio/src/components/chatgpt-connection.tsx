"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";

import type { Model } from "@/lib/chatgpt/responses";
import type { ChatGptStatus, SignInResult } from "@/lib/chatgpt/session";

type Connection = ChatGptStatus & { models: Model[] };

const RESULTS: Record<SignInResult, [boolean, string]> = {
  connected: [true, "ChatGPT is connected."],
  declined: [false, "ChatGPT was not connected, because you declined."],
  "no-plan": [false, "You signed in, but ChatGPT plan use was not turned on."],
  "other-account": [
    false,
    "That is a different ChatGPT account. Choose Continue with ChatGPT again to connect it.",
  ],
  failed: [false, "ChatGPT sign-in did not finish. Try again."],
};

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export function ChatGptConnection({ onChange }: { onChange?: () => void }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/chatgpt/status");
    if (response.ok) setConnection((await response.json()) as Connection);
  }, []);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("chatgpt");
    const known = RESULTS[result as SignInResult];
    if (known) {
      if (known[0]) toast.success(known[1]);
      else toast.error(known[1]);
      window.history.replaceState(null, "", "/settings");
    }
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const response = await send("/api/chatgpt/sign-in", "POST", { accepted });
      if (!response.ok) throw new Error();
      const { url } = (await response.json()) as { url: string };
      window.location.assign(url);
    } catch {
      toast.error("Couldn't start ChatGPT sign-in. Try again.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const response = await send("/api/chatgpt/sign-in", "DELETE");
      if (!response.ok) throw new Error();
      const { confirmed } = (await response.json()) as { confirmed: boolean };
      if (confirmed) toast.success("ChatGPT is disconnected.");
      else
        toast.warning(
          "Disconnected here, but OpenAI did not confirm it. You can also disconnect in ChatGPT under Settings, Security and login."
        );
      await load();
      onChange?.();
    } catch {
      toast.error("Couldn't disconnect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseModel(model: string) {
    const response = await send("/api/chatgpt/model", "PUT", { model });
    if (!response.ok) {
      toast.error("Couldn't save that model.");
      return;
    }
    setConnection((now) => (now ? { ...now, model } : now));
  }

  const connected = connection?.signedIn && connection.planEnabled;
  const models = connection?.models ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>ChatGPT</CardTitle>
        <CardDescription>
          Script Writer and Clip Studio run on your own ChatGPT plan, and usage
          counts toward that plan&apos;s limits. This app can&apos;t read your
          ChatGPT conversations or memories.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!connection ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : connected ? (
          <>
            <p className="text-sm">
              Connected{connection.email ? ` as ${connection.email}` : ""}.
            </p>
            {models.length ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="chatgpt-model">Model</Label>
                <select
                  id="chatgpt-model"
                  className="border-input bg-background h-9 max-w-xs rounded-md border px-2 text-sm"
                  value={connection.model ?? models[0]?.slug}
                  onChange={(event) => void chooseModel(event.target.value)}
                >
                  {models.map(({ slug, displayName }) => (
                    <option key={slug} value={slug}>
                      {displayName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => void disconnect()}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
                Disconnect
              </Button>
              <a
                href="https://chatgpt.com/settings/usage"
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground inline-flex items-center gap-1 text-sm underline"
              >
                Usage and app limits <ExternalLink className="size-3" />
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <Checkbox
                id="chatgpt-accept"
                checked={accepted}
                onCheckedChange={(value) => setAccepted(value === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="chatgpt-accept"
                className="text-sm leading-5 font-normal"
              >
                <span>
                  I am 18 or older and I have read the{" "}
                  <Link href="/privacy" className="underline">
                    privacy notice
                  </Link>
                  . What I enter goes to OpenAI on my own plan.
                </span>
              </Label>
            </div>
            <Button
              className="self-start"
              onClick={() => void connect()}
              disabled={busy || !accepted}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Continue with ChatGPT
            </Button>
            <p className="text-muted-foreground text-xs">
              Works with ChatGPT Go, Plus and Pro plans.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
