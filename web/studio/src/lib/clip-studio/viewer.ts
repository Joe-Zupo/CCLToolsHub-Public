import { jsonError } from "@/lib/api";
import { owner } from "@/lib/script-writer/server";

import { readJob, type Owner } from "./store";
import type { JobJson } from "./types";

export { owner };

/** One of the Creator's jobs, or a 404. */
export async function requireJob(
  jobId: string
): Promise<
  { ok: true; owner: Owner; job: JobJson } | { ok: false; response: Response }
> {
  const job = await readJob(owner, jobId);
  if (!job) return { ok: false, response: jsonError(404, "No such job.") };
  return { ok: true, owner, job };
}
