#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const distDirectory = process.env.RTLAB_BUILD_DIR?.trim() || ".next";
const standalone = resolve(root, distDirectory, "standalone");

async function main(): Promise<void> {
  await mkdir(resolve(standalone, ".next"), { recursive: true });
  await Promise.all([
    cp(resolve(root, "public"), resolve(standalone, "public"), {
      recursive: true,
      force: true,
    }),
    cp(resolve(root, distDirectory, "static"), resolve(standalone, ".next/static"), {
      recursive: true,
      force: true,
    }),
  ]);
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      event: "standalone_assets_prepared",
      timestamp: new Date().toISOString(),
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      event: "standalone_assets_failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
