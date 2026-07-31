import { ObjectId } from "mongodb";

import { ApiError } from "@/lib/api";
import { collections } from "@/lib/db/collections";
import type {
  AttemptDocument,
  Module,
  ReviewEventDocument,
} from "@/types/domain";

interface RankedQuestion {
  questionId: ObjectId;
  ministryId: string;
  text: string;
  subject: string;
  subtopic?: string;
  module: Module;
  options: Array<{ id: string; text: string }>;
  wrong: number;
  correct: number;
  omitted: number;
  attempts: number;
  lastWrongAt: Date;
}

export function rankWrongQuestions(
  attempts: AttemptDocument[],
  module?: Module,
): RankedQuestion[] {
  const ranking = new Map<string, RankedQuestion>();
  for (const attempt of attempts) {
    if (
      (attempt.status !== "completed" && attempt.status !== "expired") ||
      !attempt.completedAt ||
      (module && attempt.module !== module)
    ) {
      continue;
    }
    const completedAt = attempt.completedAt;
    attempt.questions.forEach((question, index) => {
      const result = attempt.responses[index]?.result;
      if (!result) return;
      const key = question.questionId.toHexString();
      const current = ranking.get(key) ?? {
        questionId: question.questionId,
        ministryId: question.ministryId,
        text: question.text,
        subject: question.subject,
        ...(question.subtopic ? { subtopic: question.subtopic } : {}),
        module: attempt.module,
        options: question.options,
        wrong: 0,
        correct: 0,
        omitted: 0,
        attempts: 0,
        lastWrongAt: new Date(0),
      };
      current.attempts += 1;
      current[result] += 1;
      if (result === "wrong" && completedAt > current.lastWrongAt) {
        current.lastWrongAt = completedAt;
        current.options = question.options;
      }
      ranking.set(key, current);
    });
  }
  return [...ranking.values()]
    .filter((question) => question.wrong > 0)
    .sort(
      (a, b) =>
        b.wrong - a.wrong ||
        a.correct / a.attempts - b.correct / b.attempts ||
        b.lastWrongAt.getTime() - a.lastWrongAt.getTime(),
    );
}

export async function reviewFeed(
  userId: ObjectId,
  module?: Module,
  limit = 50,
) {
  const { attempts } = await collections();
  const history = await attempts
    .find({
      userId,
      status: { $in: ["completed", "expired"] },
      summary: { $exists: true },
      ...(module ? { module } : {}),
    })
    .toArray();
  return {
    questions: rankWrongQuestions(history, module)
      .slice(0, limit)
      .map((question) => ({
        questionId: question.questionId.toHexString(),
        ministryId: question.ministryId,
        text: question.text,
        subject: question.subject,
        ...(question.subtopic ? { subtopic: question.subtopic } : {}),
        module: question.module,
        options: question.options,
        metrics: {
          wrong: question.wrong,
          attempts: question.attempts,
          accuracy: question.attempts
            ? Math.round((question.correct / question.attempts) * 10_000) / 100
            : 0,
        },
      })),
  };
}

export async function answerReviewQuestion(
  userId: ObjectId,
  input: {
    questionId: ObjectId;
    selectedOptionId: string;
    reviewSessionId: string;
  },
  now = new Date(),
) {
  const { attempts, questions, reviewEvents } = await collections();
  const historicalAttempts = await attempts
    .find({
      userId,
      status: { $in: ["completed", "expired"] },
      "questions.questionId": input.questionId,
    })
    .toArray();
  const eligible = historicalAttempts.some((attempt) =>
    attempt.questions.some(
      (question, index) =>
        question.questionId.equals(input.questionId) &&
        attempt.responses[index]?.result === "wrong",
    ),
  );
  if (!eligible) {
    throw new ApiError(
      404,
      "QUESTION_NOT_IN_REVIEW",
      "Questa domanda non appartiene al tuo ripasso.",
    );
  }
  const question = await questions.findOne({ _id: input.questionId });
  if (!question) {
    throw new ApiError(404, "QUESTION_NOT_FOUND", "Domanda non trovata.");
  }
  if (!question.options.some((option) => option.id === input.selectedOptionId)) {
    throw new ApiError(400, "INVALID_OPTION", "Risposta selezionata non valida.");
  }
  const correct = input.selectedOptionId === question.correctOptionId;
  const event: ReviewEventDocument = {
    _id: new ObjectId(),
    userId,
    questionId: question._id,
    ministryId: question.ministryId,
    module: question.module,
    selectedOptionId: input.selectedOptionId,
    correctOptionId: question.correctOptionId,
    correct,
    reviewSessionId: input.reviewSessionId,
    createdAt: now,
  };
  await reviewEvents.insertOne(event);
  return {
    questionId: question._id.toHexString(),
    selectedOptionId: input.selectedOptionId,
    correctOptionId: question.correctOptionId,
    correct,
  };
}
