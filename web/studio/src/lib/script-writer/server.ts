import { join } from "node:path";

import { dataFolder } from "@/lib/data-folder";

import { createDocStore, type Owner } from "./store";

/** The studio has one person, and `src/proxy.ts` keeps everyone else out. */
export const owner: Owner = { installationId: "local", sub: "creator" };

export const store = createDocStore(join(dataFolder(), "script-writer"));
