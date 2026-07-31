#!/usr/bin/env node

import { closeMongoClient } from "@/lib/db/client";
import { expireDueAttempts } from "@/lib/exams/attempts";

async function main(): Promise<void> {
  const startedAt = Date.now();
  const expired = await expireDueAttempts();
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      event: "attempt_maintenance_completed",
      expired,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "attempt_maintenance_failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient().catch(() => undefined);
  });
