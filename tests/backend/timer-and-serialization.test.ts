import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { defaultPolicy } from "@/lib/exams/policy";
import { serializeActiveAttempt } from "@/lib/exams/serialize";
import {
  effectiveActiveMs,
  effectivePausedMs,
  remainingMs,
} from "@/lib/exams/timer";
import type { AttemptDocument } from "@/types/domain";

function attempt(status: "active" | "paused"): AttemptDocument {
  const start = new Date("2026-07-30T10:00:00.000Z");
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    examType: "initial",
    module: "general",
    bankId: "bank",
    bankVersion: "1",
    policyKey: "2026-initial-general",
    status,
    openMarker: true,
    revision: 1,
    questions: [
      {
        questionId: new ObjectId(),
        ministryId: "G_1",
        text: "Testo",
        subject: "Materia",
        contentHash: "hash",
        options: [
          { id: "A", text: "A" },
          { id: "B", text: "B" },
          { id: "C", text: "C" },
          { id: "D", text: "D" },
        ],
        correctOptionId: "A",
      },
    ],
    responses: [
      {
        questionIndex: 0,
        selectedOptionId: null,
        visited: true,
        timeSpentMs: 0,
      },
    ],
    operationIds: [],
    startedAt: start,
    updatedAt: start,
    ...(status === "active"
      ? {
          activeStartedAt: start,
          deadlineAt: new Date(start.getTime() + 3_600_000),
        }
      : { pausedAt: start }),
    activeElapsedMs: status === "active" ? 0 : 120_000,
    pausedElapsedMs: 30_000,
  };
}

describe("timer autorevole", () => {
  it("fa avanzare soltanto il tempo attivo", () => {
    const value = attempt("active");
    const now = new Date("2026-07-30T10:10:00.000Z");
    expect(effectiveActiveMs(value, now)).toBe(600_000);
    expect(remainingMs(value, 3_600_000, now)).toBe(3_000_000);
  });

  it("ferma l'attivo e contabilizza la pausa", () => {
    const value = attempt("paused");
    const now = new Date("2026-07-30T10:10:00.000Z");
    expect(effectiveActiveMs(value, now)).toBe(120_000);
    expect(effectivePausedMs(value, now)).toBe(630_000);
  });

  it("non espone mai la risposta corretta nel payload attivo", () => {
    const value = attempt("active");
    const serialized = serializeActiveAttempt(
      value,
      defaultPolicy("initial", "general"),
      value.startedAt,
    );
    expect(JSON.stringify(serialized)).not.toContain("correctOptionId");
  });
});
