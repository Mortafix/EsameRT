import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    await getDb().then((db) => db.command({ ping: 1 }));
    return NextResponse.json({
      status: "ok",
      database: "reachable",
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "health_database_unreachable",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
