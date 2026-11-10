import type { Metadata } from "next";

import { Toaster } from "@repo/ui/components/sonner";

import { SettingsView } from "@/components/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <SettingsView />
      <Toaster position="bottom-center" />
    </>
  );
}
