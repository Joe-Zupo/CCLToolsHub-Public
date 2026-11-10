import { NextResponse, type NextRequest } from "next/server";

import { isLocalRequest } from "@/lib/local-request";

export function proxy(request: NextRequest) {
  const allowed = isLocalRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    isApi: request.nextUrl.pathname.startsWith("/api/"),
  });
  if (allowed) return NextResponse.next();
  return new NextResponse("This site only answers on this computer.", {
    status: 403,
  });
}

// A proxy buffers request bodies, so the video upload checks for itself.
export const config = { matcher: ["/((?!api/clip-studio/upload).*)"] };
