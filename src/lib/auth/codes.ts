import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

import { getCodeEncryptionKey, getConfig } from "@/lib/config";

const CODE_PATTERN = /^(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}._~!@#$%^&*+=?-]{10,64}$/u;

export function normalizeCode(code: string): string {
  return code.normalize("NFKC").trim().toLocaleLowerCase("it-IT");
}

export function validateCode(code: string): string {
  const normalized = normalizeCode(code);
  if (!CODE_PATTERN.test(normalized)) {
    throw new Error(
      "Il codice deve avere 10–64 caratteri, almeno una lettera e un numero, senza spazi.",
    );
  }
  return normalized;
}

export function digestCode(normalizedCode: string): string {
  return createHmac("sha256", getConfig().AUTH_PEPPER)
    .update(normalizedCode)
    .digest("base64url");
}

export async function hashCode(normalizedCode: string): Promise<string> {
  return hash(normalizedCode, {
    // @node-rs/argon2 espone Algorithm come ambient const enum, incompatibile
    // con isolatedModules. Il valore documentato di Argon2id è 2.
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyCodeHash(
  codeHash: string,
  normalizedCode: string,
): Promise<boolean> {
  try {
    return await verify(codeHash, normalizedCode);
  } catch {
    return false;
  }
}

export function encryptCode(normalizedCode: string): string {
  const key = getCodeEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalizedCode, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptCode(payload: string): string {
  const [version, ivValue, tagValue, ciphertextValue, extra] = payload.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra !== undefined
  ) {
    throw new Error("Formato del codice cifrato non valido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getCodeEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function codeHint(normalizedCode: string): string {
  return `••••••${normalizedCode.slice(-4)}`;
}
