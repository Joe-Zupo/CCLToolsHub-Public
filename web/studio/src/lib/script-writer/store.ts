import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Documents as JSON files, one folder per member, for running on this computer.
 * `pg-store.ts` is the same thing in Postgres for a deployment. The owner always comes from verified claims. Paths come from the page, so
 * they are checked here and can only ever land inside the owner's folder.
 */
export type Owner = { installationId: string; sub: string };
export type StoredDoc = Record<string, unknown>;
export type ListOptions = { orderBy?: string; limit?: number };

export class BadPathError extends Error {
  constructor(path: string) {
    super(`Bad document path: ${path}`);
    this.name = "BadPathError";
  }
}

/** Keeps a response under the host's limit, newest documents first. */
export const MAX_LIST_BYTES = 4_000_000;
export const MAX_DOC_BYTES = 2_000_000;
export const MAX_DOCS = 2_000;

export function fitList<T>(docs: T[], maxBytes = MAX_LIST_BYTES) {
  let used = 0;
  const kept: T[] = [];
  for (const doc of docs) {
    used += Buffer.byteLength(JSON.stringify(doc));
    if (used > maxBytes) return { docs: kept, truncated: true };
    kept.push(doc);
  }
  return { docs: kept, truncated: false };
}

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

export const segments = (path: string) => {
  const parts = path.split("/");
  if (!parts.every((part) => SEGMENT.test(part))) throw new BadPathError(path);
  return parts;
};

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

export function createDocStore(root: string): DocStore {
  const ownerDir = (owner: Owner) =>
    join(
      root,
      encodeURIComponent(owner.installationId),
      encodeURIComponent(owner.sub)
    );

  const docFile = (owner: Owner, path: string) => {
    const parts = segments(path);
    const last = parts.pop() as string;
    return join(ownerDir(owner), ...parts, `${last}.json`);
  };

  return {
    async get(owner: Owner, path: string): Promise<StoredDoc | null> {
      try {
        const text = await readFile(docFile(owner, path), "utf8");
        return JSON.parse(text) as StoredDoc;
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async set(owner: Owner, path: string, data: StoredDoc): Promise<void> {
      const file = docFile(owner, path);
      await mkdir(dirname(file), { recursive: true });
      // A crash mid-write leaves the old file whole.
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(data));
      await rename(temp, file);
    },

    async remove(owner: Owner, path: string): Promise<void> {
      await rm(docFile(owner, path), { force: true });
    },

    /** Every document path this member has. */
    async paths(owner: Owner): Promise<string[]> {
      let names: string[];
      try {
        names = await readdir(ownerDir(owner), { recursive: true });
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      return names
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length).replaceAll("\\", "/"));
    },

    async removeAll(owner: Owner): Promise<void> {
      await rm(ownerDir(owner), { recursive: true, force: true });
    },

    async removeInstallation(installationId: string): Promise<void> {
      await rm(join(root, encodeURIComponent(installationId)), {
        recursive: true,
        force: true,
      });
    },

    /** Only deployments keep data for other people, so there is nothing to age out here. */
    async removeInactive(): Promise<number> {
      return 0;
    },

    /** The documents directly in a collection, newest first by `orderBy`. */
    async list(
      owner: Owner,
      collection: string,
      { orderBy, limit }: ListOptions = {}
    ): Promise<{ id: string; data: StoredDoc }[]> {
      const dir = join(ownerDir(owner), ...segments(collection));
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      const docs = await Promise.all(
        names
          .filter((name) => name.endsWith(".json"))
          .map(async (name) => ({
            id: name.slice(0, -".json".length),
            data: JSON.parse(
              await readFile(join(dir, name), "utf8")
            ) as StoredDoc,
          }))
      );
      if (orderBy)
        docs.sort(
          (a, b) => Number(b.data[orderBy] ?? 0) - Number(a.data[orderBy] ?? 0)
        );
      return limit ? docs.slice(0, limit) : docs;
    },
  };
}

export type DocStore = {
  get(owner: Owner, path: string): Promise<StoredDoc | null>;
  set(owner: Owner, path: string, data: StoredDoc): Promise<void>;
  remove(owner: Owner, path: string): Promise<void>;
  paths(owner: Owner): Promise<string[]>;
  removeAll(owner: Owner): Promise<void>;
  removeInstallation(installationId: string): Promise<void>;
  /** Deletes members with no saved change since `before`. Returns the rows removed. */
  removeInactive(before: Date): Promise<number>;
  list(
    owner: Owner,
    collection: string,
    options?: ListOptions
  ): Promise<{ id: string; data: StoredDoc }[]>;
};
