import { preflight } from "@/lib/clip-studio/pipeline";
import { readConfig } from "@/lib/clip-studio/store";
import type { ServiceId } from "@/lib/clip-studio/types";
import { owner } from "@/lib/clip-studio/viewer";

const ALL: ServiceId[] = ["agent", "assemblyai", "storage"];

/** Whether each service can run now. The agent check may spend a few tokens. */
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("services");
  const services = asked
    ? ALL.filter((id) => asked.split(",").includes(id))
    : ALL;
  const config = await readConfig(owner);
  return Response.json(
    { data: await preflight(config, services) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
