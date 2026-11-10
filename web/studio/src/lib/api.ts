/** JSON error response used by the route handlers. */
export function jsonError(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/** Read `{ error }` from a failed response, falling back to the status text. */
export async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Not JSON.
  }
  return `${response.status} ${response.statusText}`.trim();
}
