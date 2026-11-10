import { installSecret } from "@/lib/install-secret";
import { createCipher } from "@/lib/script-writer/crypto";

/** Clip Studio's saved keys use this computer's secret, like Script Writer's. */
export const encrypt = (plain: string) =>
  createCipher(installSecret()).encrypt(plain);

export const decrypt = (stored: string) =>
  createCipher(installSecret()).decrypt(stored);
