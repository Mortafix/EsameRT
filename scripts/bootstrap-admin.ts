#!/usr/bin/env node

import { createInterface } from "node:readline/promises";

import { ApiError } from "@/lib/api";
import { bootstrapFirstAdmin } from "@/lib/admin/bootstrap";
import { closeMongoClient } from "@/lib/db/client";

import { readHidden } from "./lib/hidden-input";

function nameFromArguments(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--name");
  if (index === -1) return undefined;
  const value = argv[index + 1]?.trim();
  if (!value) throw new Error("--name richiede un valore.");
  return value;
}

async function askName(): Promise<string> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await terminal.question("Nome amministratore: ")).trim();
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(
      "Uso: npm run admin:bootstrap -- [--name \"Nome amministratore\"]\n",
    );
    return;
  }

  const name = nameFromArguments(process.argv.slice(2)) ?? (await askName());
  const code = await readHidden("Codice personale: ");
  const confirmation = await readHidden("Ripeti il codice: ");
  if (code !== confirmation) {
    throw new Error("I codici inseriti non coincidono.");
  }

  try {
    const admin = await bootstrapFirstAdmin(name, code);
    process.stdout.write(
      `${JSON.stringify({
        level: "info",
        event: "first_admin_created",
        admin,
        timestamp: new Date().toISOString(),
      })}\n`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "ADMIN_ALREADY_EXISTS") {
      process.stdout.write(
        `${JSON.stringify({
          level: "info",
          event: "first_admin_already_present",
          message: error.message,
          timestamp: new Date().toISOString(),
        })}\n`,
      );
      return;
    }
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "first_admin_bootstrap_failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient().catch(() => undefined);
  });
