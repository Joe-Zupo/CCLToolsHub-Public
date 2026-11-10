import { Suspense } from "react";
import type { Metadata } from "next";

import { Toaster } from "@repo/ui/components/sonner";

import { ClipStudio } from "@/components/clip-studio/clip-studio";

export const metadata: Metadata = { title: "Clip Studio" };

export default function ClipStudioPage() {
  return (
    <>
      <Suspense>
        <ClipStudio />
      </Suspense>
      <Toaster position="bottom-center" />
    </>
  );
}
