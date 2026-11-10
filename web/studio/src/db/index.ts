import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { recoverInterrupted } from "@/lib/clip-studio/store-core";
import { dataFolder } from "@/lib/data-folder";

import * as schema from "./schema";

async function open() {
  const folder = join(dataFolder(), "clip-studio", "db");
  mkdirSync(folder, { recursive: true });
  const db = drizzle(new PGlite(folder), { schema });
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  await recoverInterrupted(db);
  return db;
}

type Db = Awaited<ReturnType<typeof open>>;
const global_ = globalThis as unknown as { cclToolsDb?: Promise<Db> };

/** One database per process: PGlite allows one writer on its folder. */
export const getDb = () =>
  (global_.cclToolsDb ??= open().catch((error: unknown) => {
    global_.cclToolsDb = undefined;
    throw error;
  }));

/** Closes the database if this process opened it. */
export async function closeDb(): Promise<void> {
  const opening = global_.cclToolsDb;
  if (!opening) return;
  await (await opening).$client.close();
}
