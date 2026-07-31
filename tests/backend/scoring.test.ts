import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { defaultPolicy } from "@/lib/exams/policy";
import { gradeAttempt } from "@/lib/exams/scoring";
import type {
  AttemptQuestionSnapshot,
  AttemptResponse,
} from "@/types/domain";

function exam(correct: number, wrong: number) {
  const questions: AttemptQuestionSnapshot[] = Array.from(
    { length: 40 },
    (_, index) => ({
      questionId: new ObjectId(),
      ministryId: `G_${index}`,
      text: `Domanda ${index}`,
      subject: "Normativa",
      contentHash: `hash-${index}`,
      options: [
        { id: "A", text: "Corretta" },
        { id: "B", text: "Errata" },
        { id: "C", text: "Errata 2" },
        { id: "D", text: "Errata 3" },
      ],
      correctOptionId: "A",
    }),
  );
  const responses: AttemptResponse[] = questions.map((_, questionIndex) => ({
    questionIndex,
    selectedOptionId:
      questionIndex < correct
        ? "A"
        : questionIndex < correct + wrong
          ? "B"
          : null,
    visited: true,
    timeSpentMs: 1_000,
  }));
  return { questions, responses };
}

describe("gradeAttempt", () => {
  it("applica +1, -0,5 e 0 e la soglia generale iniziale", () => {
    const { questions, responses } = exam(33, 2);
    const result = gradeAttempt(
      questions,
      responses,
      defaultPolicy("initial", "general"),
      100_000,
      20_000,
    );
    expect(result.summary).toMatchObject({
      score: 32,
      threshold: 32,
      passed: true,
      correct: 33,
      wrong: 2,
      omitted: 5,
    });
  });

  it("usa soglia 34 per lo specialistico iniziale", () => {
    const { questions, responses } = exam(34, 0);
    expect(
      gradeAttempt(
        questions,
        responses,
        defaultPolicy("initial", "cat8"),
        0,
        0,
      ).summary.passed,
    ).toBe(true);
  });

  it("usa soglia 28 per l'aggiornamento", () => {
    const { questions, responses } = exam(28, 0);
    expect(
      gradeAttempt(
        questions,
        responses,
        defaultPolicy("update", "cat145"),
        0,
        0,
      ).summary.passed,
    ).toBe(true);
  });

  it("conserva la scelta saltata ma la valuta come omessa", () => {
    const { questions, responses } = exam(40, 0);
    responses[0] = { ...responses[0]!, skipped: true };
    const result = gradeAttempt(
      questions,
      responses,
      defaultPolicy("initial", "general"),
      0,
      0,
    );
    expect(result.responses[0]).toMatchObject({
      selectedOptionId: "A",
      skipped: true,
      result: "omitted",
      points: 0,
    });
    expect(result.summary).toMatchObject({
      correct: 39,
      omitted: 1,
      score: 39,
    });
  });
});
