import { getDb } from "@/db";

import { createClipStore, type ClipStore } from "./store-core";

export {
  configJson,
  newJobId,
  type Owner,
  type StoredConfig,
  type Transcript,
} from "./store-core";

let opened: Promise<ClipStore> | undefined;
const store = () => (opened ??= getDb().then(createClipStore));

const lazy = <K extends keyof ClipStore>(name: K) =>
  (async (...args: unknown[]) => {
    const open = await store();
    return (open[name] as (...a: unknown[]) => unknown)(...args);
  }) as ClipStore[K];

export const deleteOwnerData = lazy("deleteOwnerData");
export const readConfig = lazy("readConfig");
export const updateConfig = lazy("updateConfig");
export const createJob = lazy("createJob");
export const readJobRow = lazy("readJobRow");
export const readJob = lazy("readJob");
export const listJobs = lazy("listJobs");
export const updateJob = lazy("updateJob");
export const deleteJob = lazy("deleteJob");
export const upsertExport = lazy("upsertExport");
export const exportUrl = lazy("exportUrl");
