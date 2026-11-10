export const dynamic = "force-dynamic";

/** Lets the launcher tell this app from another program on the port. */
export function GET() {
  return Response.json(
    { app: "clipscript-studio" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
