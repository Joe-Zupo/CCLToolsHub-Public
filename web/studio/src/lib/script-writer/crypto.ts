import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM for the keys members save, so a copy of the data alone does not
 * leak them. Stored as `v1.<base64 iv|tag|ciphertext>`; empty stays empty.
 */
export type Cipher = {
  encrypt: (plain: string) => string;
  decrypt: (stored: string) => string;
};

export function createCipher(secret: string | undefined): Cipher {
  const key = () => {
    if (!secret)
      throw new Error(
        "SCRIPT_WRITER_SECRET is not set, so keys cannot be stored."
      );
    return createHash("sha256").update(secret).digest();
  };

  return {
    encrypt(plain) {
      if (!plain) return "";
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(), iv);
      const body = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
      ]);
      return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
    },

    /** The plain key, or "" when it is empty or no longer decrypts (secret rotated). */
    decrypt(stored) {
      if (!stored.startsWith("v1.")) return "";
      try {
        const raw = Buffer.from(stored.slice(3), "base64");
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key(),
          raw.subarray(0, 12)
        );
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([
          decipher.update(raw.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        return "";
      }
    },
  };
}
