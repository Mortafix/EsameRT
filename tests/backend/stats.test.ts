import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { buildPersonalStats } from "@/lib/stats/personal";
import type { AttemptDocument } from "@/types/domain";

function attempt(score: number, passed: boolean, completedAt: Date): AttemptDocument {
  const questionId = new ObjectId();
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    examType: "initial",
    module: "general",
    bankId: "bank",
    bankVersion: "1",
    policyKey: "2026-initial-general",
    status: "completed",
    revision: 2,
    questions: [
      {
        questionId,
        ministryId: "G_1",
        text: "Domanda",
        subject: "Normativa",
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
        selectedOptionId: passed ? "A" : "B",
        visited: true,
        timeSpentMs: 12_000,
        result: passed ? "correct" : "wrong",
        points: passed ? 1 : -0.5,
      },
    ],
    operationIds: [],
    startedAt: new Date(completedAt.getTime() - 60_000),
    updatedAt: completedAt,
    completedAt,
    activeElapsedMs: 60_000,
    pausedElapsedMs: 0,
    summary: {
      score,
      threshold: 32,
      passed,
      correct: passed ? 1 : 0,
      wrong: passed ? 0 : 1,
      omitted: 0,
      activeTimeMs: 60_000,
      pausedTimeMs: 0,
    },
  };
}

describe("statistiche personali", () => {
  it("ricostruisce KPI, trend e distribuzioni esclusivamente dai tentativi", () => {
    const result = buildPersonalStats(
      [
        attempt(30, false, new Date("2026-07-01")),
        attempt(35, true, new Date("2026-07-02")),
      ],
      [],
      100,
    );
    expect(result.summary).toMatchObject({
      completed: 2,
      passed: 1,
      passRate: 50,
      averageScore: 32.5,
      bestScore: 35,
      lastScore: 35,
      sampleSize: 2,
    });
    expect(result.trend).toHaveLength(2);
    expect(result.bySubject[0]).toMatchObject({
      subject: "Normativa",
      answered: 2,
      averageTimeMs: 12_000,
    });
  });
});
