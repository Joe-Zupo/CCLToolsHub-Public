import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { RULES_SIZE } from "@/lib/script-writer/prompts";

const room = (file: string) =>
  readFile(join(process.cwd(), "src", "room", file), "utf8");

/** The Script Room page, with the bridge to this app's routes ahead of its script. */
export async function GET() {
  const [html, bridge, shell] = await Promise.all([
    room("index.html"),
    room("bridge.js"),
    room("shell.js"),
  ]);
  const flags = `window.__LOCAL__ = true; window.__RULES_SIZE__ = ${RULES_SIZE};`;
  return new Response(
    html.replace(
      "<script>",
      () => `<script>${flags}\n${bridge}\n${shell}</script>\n<script>`
    ),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
