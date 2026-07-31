import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { rankWrongQuestions } from "@/lib/review/service";
import type { AttemptDocument, QuestionResult } from "@/types/domain";

function completedAttempt(
  questionId: ObjectId,
  ministryId: string,
  result: QuestionResult,
  completedAt: Date,
): AttemptDocument {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    examType: "initial",
    module: "cat8",
    bankId: "bank",
    bankVersion: "1",
    policyKey: "2026-initial-specialist",
    status: "completed",
    revision: 2,
    questions: [
      {
        questionId,
        ministryId,
        text: ministryId,
        subject: "Materia",
        contentHash: ministryId,
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
        selectedOptionId: result === "omitted" ? null : result === "correct" ? "A" : "B",
        visited: true,
        timeSpentMs: 1,
        result,
        points: result === "correct" ? 1 : result === "wrong" ? -0.5 : 0,
      },
    ],
    operationIds: [],
    startedAt: new Date(completedAt.getTime() - 1_000),
    updatedAt: completedAt,
    completedAt,
    activeElapsedMs: 1_000,
    pausedElapsedMs: 0,
    summary: {
      score: 0,
      threshold: 34,
      passed: false,
      correct: result === "correct" ? 1 : 0,
      wrong: result === "wrong" ? 1 : 0,
      omitted: result === "omitted" ? 1 : 0,
      activeTimeMs: 1_000,
      pausedTimeMs: 0,
    },
  };
}

describe("ranking del ripasso", () => {
  it("ordina per errori assoluti, poi accuratezza, poi errore recente", () => {
    const first = new ObjectId();
    const second = new ObjectId();
    const history = [
      completedAttempt(first, "Q1", "wrong", new Date("2026-07-01")),
      completedAttempt(first, "Q1", "wrong", new Date("2026-07-02")),
      completedAttempt(second, "Q2", "wrong", new Date("2026-07-03")),
    ];
    const ranking = rankWrongQuestions(history);
    expect(ranking.map((question) => question.ministryId)).toEqual(["Q1", "Q2"]);
    expect(ranking[0]?.wrong).toBe(2);
  });
});
