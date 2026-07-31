import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default("rt_lab"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_PEPPER: z.string().min(32),
  SESSION_PEPPER: z.string().min(32),
  CODE_ENCRYPTION_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

function decodeEncryptionKey(value: string): Buffer {
  const encoding = /^[0-9a-f]{64}$/i.test(value) ? "hex" : "base64";
  const key = Buffer.from(value, encoding);
  if (key.length !== 32) {
    throw new Error(
      "CODE_ENCRYPTION_KEY deve contenere esattamente 32 byte (base64 o 64 caratteri hex).",
    );
  }
  return key;
}

export function getConfig(): AppConfig {
  if (!cached) {
    cached = schema.parse(process.env);
    decodeEncryptionKey(cached.CODE_ENCRYPTION_KEY);
  }
  return cached;
}

export function getCodeEncryptionKey(): Buffer {
  return decodeEncryptionKey(getConfig().CODE_ENCRYPTION_KEY);
}

export function resetConfigForTests(): void {
  cached = undefined;
}

export const SESSION_COOKIE_NAME = "rtlab_session";
export const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
export const ADMIN_REAUTH_WINDOW_MS = 10 * 60 * 1000;
export const EXAM_DURATION_MS = 60 * 60 * 1000;
export const EXAM_QUESTION_COUNT = 40;
