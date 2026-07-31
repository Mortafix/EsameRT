import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { getConfig } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function success<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function failure(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "I dati inviati non sono validi.",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "api_unhandled_error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Si è verificato un errore interno.",
      },
    },
    { status: 500 },
  );
}

export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      return failure(error);
    }
  };
}

export async function parseBody<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Il corpo della richiesta non è JSON valido.");
  }
  return schema.parse(body);
}

export function parseObjectId(value: string, label = "ID"): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(400, "INVALID_ID", `${label} non valido.`);
  }
  return new ObjectId(value);
}

export function requireSameOrigin(request: NextRequest): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new ApiError(403, "CROSS_SITE_REQUEST", "Richiesta cross-site rifiutata.");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const expected = new URL(getConfig().APP_URL).origin;
  if (origin !== expected) {
    throw new ApiError(403, "INVALID_ORIGIN", "Origine della richiesta non valida.");
  }
}

export function getIdempotencyKey(request: NextRequest): string | undefined {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return undefined;
  if (value.length < 8 || value.length > 128) {
    throw new ApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key deve contenere tra 8 e 128 caratteri.",
    );
  }
  return value;
}
