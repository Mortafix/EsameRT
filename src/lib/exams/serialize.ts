import {
  effectiveActiveMs,
  effectivePausedMs,
  remainingMs,
} from "@/lib/exams/timer";
import type {
  ActiveAttemptPayload,
  AttemptDocument,
  CompletedAttemptPayload,
  ExamPolicyDocument,
} from "@/types/domain";

export function serializeActiveAttempt(
  attempt: AttemptDocument,
  policy: ExamPolicyDocument,
  now = new Date(),
): ActiveAttemptPayload {
  if (attempt.status !== "active" && attempt.status !== "paused") {
    throw new Error("Il tentativo non è aperto.");
  }
  return {
    id: attempt._id.toHexString(),
    examType: attempt.examType,
    module: attempt.module,
    status: attempt.status,
    revision: attempt.revision,
    startedAt: attempt.startedAt,
    threshold: policy.passThreshold,
    remainingMs: remainingMs(attempt, policy.durationMs, now),
    remainingSeconds: Math.ceil(
      remainingMs(attempt, policy.durationMs, now) / 1_000,
    ),
    activeElapsedMs: effectiveActiveMs(attempt, now),
    pausedElapsedMs: effectivePausedMs(attempt, now),
    questions: attempt.questions.map((question, index) => {
      const response = attempt.responses[index]!;
      return {
        id: question.questionId.toHexString(),
        index,
        position: index + 1,
        ministryId: question.ministryId,
        ministerialId: question.ministryId,
        text: question.text,
        subject: question.subject,
        ...(question.subtopic ? { subtopic: question.subtopic } : {}),
        options: question.options,
        selectedOptionId: response.selectedOptionId,
        visited: response.visited,
        skipped: response.skipped ?? false,
        response: {
          questionIndex: response.questionIndex,
          selectedOptionId: response.selectedOptionId,
          visited: response.visited,
          skipped: response.skipped ?? false,
          ...(response.answeredAt ? { answeredAt: response.answeredAt } : {}),
          timeSpentMs: response.timeSpentMs,
        },
      };
    }),
  };
}

export function serializeCompletedAttempt(
  attempt: AttemptDocument,
): CompletedAttemptPayload {
  if (
    (attempt.status !== "completed" && attempt.status !== "expired") ||
    !attempt.completedAt ||
    !attempt.summary
  ) {
    throw new Error("Il tentativo non è concluso.");
  }
  return {
    id: attempt._id.toHexString(),
    examType: attempt.examType,
    module: attempt.module,
    status: attempt.status,
    revision: attempt.revision,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    summary: attempt.summary,
    score: attempt.summary.score,
    threshold: attempt.summary.threshold,
    passed: attempt.summary.passed,
    correctCount: attempt.summary.correct,
    wrongCount: attempt.summary.wrong,
    omittedCount: attempt.summary.omitted,
    activeSeconds: Math.round(attempt.summary.activeTimeMs / 1_000),
    pausedSeconds: Math.round(attempt.summary.pausedTimeMs / 1_000),
    questions: attempt.questions.map((question, index) => {
      const response = attempt.responses[index]!;
      return {
        id: question.questionId.toHexString(),
        index,
        position: index + 1,
        ministryId: question.ministryId,
        ministerialId: question.ministryId,
        text: question.text,
        subject: question.subject,
        ...(question.subtopic ? { subtopic: question.subtopic } : {}),
        options: question.options,
        selectedOptionId: response.selectedOptionId,
        visited: response.visited,
        skipped: response.skipped ?? false,
        response: {
          questionIndex: response.questionIndex,
          selectedOptionId: response.selectedOptionId,
          visited: response.visited,
          skipped: response.skipped ?? false,
          ...(response.answeredAt ? { answeredAt: response.answeredAt } : {}),
          timeSpentMs: response.timeSpentMs,
        },
        correctOptionId: question.correctOptionId,
        result: response.result ?? "omitted",
        points: response.points ?? 0,
      };
    }),
  };
}
