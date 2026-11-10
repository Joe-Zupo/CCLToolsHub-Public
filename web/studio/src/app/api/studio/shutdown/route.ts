import { after } from "next/server";

import { closeDb } from "@/db";

/**
 * Closes the database before the process ends. On Windows a kill gives the app
 * no chance to do that. `src/proxy.ts` limits this route to this computer.
 */
export function POST() {
  after(async () => {
    await closeDb().catch((error: unknown) => {
      console.error("[studio] closing the database:", error);
    });
    process.exit(0);
  });
  return new Response(null, { status: 202 });
}
