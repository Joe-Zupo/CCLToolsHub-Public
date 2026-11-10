import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Everything a person makes stays in this folder on their computer. */
export const dataFolder = () =>
  process.env.STUDIO_DATA ?? join(process.cwd(), ".studio-data");

export async function folderSize(path: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) return folderSize(child);
      return entry.isFile() ? (await stat(child)).size : 0;
    })
  );
  return sizes.reduce((total, size) => total + size, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  const mb = bytes / 1024 ** 2;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}
