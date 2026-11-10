import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { dataFolder } from "@/lib/data-folder";

import * as schema from "./schema";

async function open() {
  const folder = join(dataFolder(), "clip-studio", "db");
  mkdirSync(folder, { recursive: true });
  const db = drizzle(new PGlite(folder), { schema });
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  return db;
}

type Db = Awaited<ReturnType<typeof open>>;
const global_ = globalThis as unknown as { cclToolsDb?: Promise<Db> };

/** One database per process: PGlite allows one writer on its folder. */
export const getDb = () => (global_.cclToolsDb ??= open());
