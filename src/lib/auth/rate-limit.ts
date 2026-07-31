import { collections } from "@/lib/db/collections";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CODE = 5;
const MAX_FAILURES_PER_IP = 20;

export async function isLoginRateLimited(
  codeDigest: string,
  ipHash: string,
  now = new Date(),
): Promise<boolean> {
  const { loginEvents } = await collections();
  const since = new Date(now.getTime() - WINDOW_MS);
  const base = { success: false, createdAt: { $gte: since } };
  const [byCode, byIp] = await Promise.all([
    loginEvents.countDocuments({ ...base, codeDigest }),
    loginEvents.countDocuments({ ...base, ipHash }),
  ]);
  return byCode >= MAX_FAILURES_PER_CODE || byIp >= MAX_FAILURES_PER_IP;
}
