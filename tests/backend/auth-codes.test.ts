import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  codeVerificationCandidates,
  decryptCode,
  digestCode,
  encryptCode,
  hashCode,
  normalizeCode,
  validateCode,
  verifyCodeHash,
  verifyCodeHashCaseInsensitive,
} from "@/lib/auth/codes";
import { resetConfigForTests } from "@/lib/config";

beforeAll(() => {
  process.env.MONGODB_URI = "mongodb://localhost:27017";
  process.env.MONGODB_DB = "test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.AUTH_PEPPER = "a".repeat(32);
  process.env.SESSION_PEPPER = "b".repeat(32);
  process.env.CODE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  Object.assign(process.env, { NODE_ENV: "test" });
  resetConfigForTests();
});

describe("codici di accesso", () => {
  it("normalizza in modo case-insensitive e valida i requisiti", () => {
    expect(normalizeCode("  Accesso1234  ")).toBe("ACCESSO1234");
    expect(validateCode("Accesso1234")).toBe("ACCESSO1234");
    expect(codeVerificationCandidates("Accesso1234")).toEqual([
      "ACCESSO1234",
      "accesso1234",
    ]);
    expect(() => validateCode("solol lettere")).toThrow();
  });

  it("usa digest deterministico per il lookup", () => {
    expect(digestCode("accesso1234")).toBe(digestCode("accesso1234"));
    expect(digestCode("accesso1234")).not.toBe(digestCode("accesso1235"));
  });

  it("verifica Argon2id e cifra reversibilmente con AES-GCM", async () => {
    const code = "accesso1234";
    const digest = await hashCode(code);
    expect(await verifyCodeHash(digest, code)).toBe(true);
    expect(await verifyCodeHashCaseInsensitive(digest, "AcCeSsO1234")).toBe(true);
    expect(await verifyCodeHash(digest, "accesso1235")).toBe(false);
    expect(decryptCode(encryptCode(code))).toBe(code);
  });
});
