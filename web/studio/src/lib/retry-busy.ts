const BUSY = new Set(["EBUSY", "EPERM", "EACCES"]);

/** Antivirus and search indexers briefly lock files on Windows, so try again. */
export async function retryBusy<T>(
  work: () => Promise<T>,
  attempts = 6
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= attempts || !code || !BUSY.has(code)) throw error;
      await new Promise((done) => setTimeout(done, 25 * 2 ** attempt));
    }
  }
}
