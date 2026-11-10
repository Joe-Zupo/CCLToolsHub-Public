import { Suspense } from "react";
import type { Metadata } from "next";

import { ScriptRoomFrame } from "@/components/script-room-frame";
import { Sidebar } from "@/components/sidebar";
import { ThemeSync } from "@/components/theme-control";

import "@repo/ui/globals.css";

export const metadata: Metadata = {
  title: { default: "Clipscript Studio", template: "%s · Clipscript Studio" },
  description: "Script Writer and Clip Studio, running on this computer.",
};

// Runs before first paint, so the page never flashes the wrong theme.
const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("ccl-tools.theme")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <div className="theme-studio bg-background text-foreground min-h-dvh md:flex">
          <ThemeSync />
          <Suspense>
            <Sidebar />
          </Suspense>
          <main className="min-w-0 flex-1">
            {children}
            <ScriptRoomFrame />
          </main>
        </div>
      </body>
    </html>
  );
}
