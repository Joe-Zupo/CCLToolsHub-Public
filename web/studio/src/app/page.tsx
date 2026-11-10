import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { chatGptSession, type ChatGptStatus } from "@/lib/chatgpt/session";
import { listJobs, readConfig } from "@/lib/clip-studio/store";
import { dataFolder, folderSize, formatBytes } from "@/lib/data-folder";
import { owner, store } from "@/lib/script-writer/server";

import packageJson from "../../package.json";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

const RECENT = 5;

const chatGptLabel = ({ signedIn, planEnabled }: ChatGptStatus) =>
  !signedIn ? "Not connected" : planEnabled ? "Connected" : "Plan use off";

export default async function DashboardPage() {
  const [cli, bytes, config, jobs, sessions] = await Promise.all([
    chatGptSession().status(),
    folderSize(dataFolder()),
    readConfig(owner),
    listJobs(owner),
    store.list(owner, "data/users/local", {
      orderBy: "updatedAt",
      limit: RECENT,
    }),
  ]);
  const scripts = sessions.map(({ id, data }) => ({
    id,
    title:
      typeof data.title === "string" && data.title ? data.title : "Untitled",
  }));
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto grid max-w-4xl gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Connections</CardTitle>
              <CardDescription>Change these in Settings.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Row label="ChatGPT" value={chatGptLabel(cli)} />
              <Row
                label="AssemblyAI key"
                value={config.assemblyAiKey ? "Saved" : "Not added"}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>This computer</CardTitle>
              <CardDescription>
                Space used by your scripts and videos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Row label="Disk use" value={formatBytes(bytes)} />
              <Row label="Version" value={packageJson.version} />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Recent
            title="Recent scripts"
            href="/script-writer"
            empty="Your scripts will show here."
            items={scripts.map(({ id, title }) => ({ id, label: title }))}
          />
          <Recent
            title="Recent videos"
            href="/clip-studio"
            empty="Your videos will show here."
            items={jobs
              .slice(0, RECENT)
              .map(({ id, fileName }) => ({ id, label: fileName }))}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Recent({
  title,
  href,
  empty,
  items,
}: {
  title: string;
  href: string;
  empty: string;
  items: { id: string; label: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {items.length ? (
          <ul className="grid gap-1.5">
            {items.map(({ id, label }) => (
              <li key={id} className="truncate">
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
