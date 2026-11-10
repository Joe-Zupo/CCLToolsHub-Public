export type LocalCheck = {
  host: string | null;
  origin: string | null;
  fetchSite: string | null;
  isApi: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const hostname = (host: string) => host.replace(/:\d+$/, "").toLowerCase();

/**
 * The studio has no sign-in of its own, and its routes will use the ChatGPT
 * connection and touch files on this computer. Binding to 127.0.0.1 keeps other devices
 * out. The Host check stops DNS rebinding. The origin and fetch-site checks
 * stop another website from calling the API from the Creator's browser.
 */
export function isLocalRequest({
  host,
  origin,
  fetchSite,
  isApi,
}: LocalCheck): boolean {
  if (!host || !LOCAL_HOSTS.has(hostname(host))) return false;
  if (!isApi) return true;
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
