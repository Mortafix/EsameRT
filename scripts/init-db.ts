#!/usr/bin/env node

import { bootstrapDatabase } from "@/lib/db/bootstrap";
import { closeMongoClient } from "@/lib/db/client";

async function main(): Promise<void> {
  await bootstrapDatabase();
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      event: "database_initialized",
      timestamp: new Date().toISOString(),
    })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "database_initialization_failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient().catch(() => undefined);
  });
