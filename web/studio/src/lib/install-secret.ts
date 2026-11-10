import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { dataFolder } from "./data-folder";

/**
 * Encrypts the keys saved on this computer. Each install makes its own on first
 * use, so one Creator's secret opens nothing on another computer. Deleting the
 * file makes saved keys unreadable, and the Creator has to enter them again.
 */
export function installSecret(folder = dataFolder()): string {
  const file = join(folder, "secret");
  mkdirSync(folder, { recursive: true });
  try {
    writeFileSync(file, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readFileSync(file, "utf8").trim();
}
