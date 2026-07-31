import { ObjectId, type Filter } from "mongodb";

import { collections } from "@/lib/db/collections";
import type {
  AttemptDocument,
  ExamType,
  Module,
  ReviewEventDocument,
} from "@/types/domain";

type NullableNumber = number | null;

function average(values: number[]): NullableNumber {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: NullableNumber, digits = 2): NullableNumber {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

export function buildPersonalStats(
  attempts: AttemptDocument[],
  reviewEvents: ReviewEventDocument[],
  totalQuestionCount: number,
) {
  const completed = attempts
    .filter(
      (attempt) =>
        (attempt.status === "completed" || attempt.status === "expired") &&
        attempt.summary &&
        attempt.completedAt,
    )
    .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());
  const passed = completed.filter((attempt) => attempt.summary!.passed).length;
  const scores = completed.map((attempt) => attempt.summary!.score);
  const activeTimes = completed.map((attempt) => attempt.summary!.activeTimeMs);
  const margins = completed.map(
    (attempt) => attempt.summary!.score - attempt.summary!.threshold,
  );
  const correct = completed.reduce(
    (sum, attempt) => sum + attempt.summary!.correct,
    0,
  );
  const wrong = completed.reduce((sum, attempt) => sum + attempt.summary!.wrong, 0);
  const omitted = completed.reduce(
    (sum, attempt) => sum + attempt.summary!.omitted,
    0,
  );

  const group = <K extends string>(
    key: (attempt: AttemptDocument) => K,
  ): Array<{
    key: K;
    attempts: number;
    averageScore: NullableNumber;
    passRate: number;
  }> => {
    const map = new Map<K, AttemptDocument[]>();
    for (const attempt of completed) {
      const value = key(attempt);
      map.set(value, [...(map.get(value) ?? []), attempt]);
    }
    return [...map.entries()].map(([value, items]) => ({
      key: value,
      attempts: items.length,
      averageScore: round(average(items.map((item) => item.summary!.score))),
      passRate: percentage(
        items.filter((item) => item.summary!.passed).length,
        items.length,
      ),
    }));
  };

  const byQuestion = new Map<
    string,
    {
      ministryId: string;
      text: string;
      module: Module;
      subject: string;
      wrong: number;
      correct: number;
      omitted: number;
      attempts: number;
      totalTimeMs: number;
      lastWrongAt?: Date;
    }
  >();
  const bySubject = new Map<
    string,
    {
      answered: number;
      correct: number;
      wrong: number;
      omitted: number;
      totalTimeMs: number;
      appearances: number;
    }
  >();
  const seenQuestionIds = new Set<string>();

  for (const attempt of completed) {
    attempt.questions.forEach((question, index) => {
      const response = attempt.responses[index];
      if (!response?.result) return;
      const id = question.questionId.toHexString();
      seenQuestionIds.add(id);
      const current = byQuestion.get(id) ?? {
        ministryId: question.ministryId,
        text: question.text,
        module: attempt.module,
        subject: question.subject,
        wrong: 0,
        correct: 0,
        omitted: 0,
        attempts: 0,
        totalTimeMs: 0,
      };
      current.attempts += 1;
      current.totalTimeMs += response.timeSpentMs;
      current[response.result] += 1;
      if (response.result === "wrong") current.lastWrongAt = attempt.completedAt;
      byQuestion.set(id, current);

      const subject = bySubject.get(question.subject) ?? {
        answered: 0,
        correct: 0,
        wrong: 0,
        omitted: 0,
        totalTimeMs: 0,
        appearances: 0,
      };
      subject.answered += response.result === "omitted" ? 0 : 1;
      subject[response.result] += 1;
      subject.totalTimeMs += response.timeSpentMs;
      subject.appearances += 1;
      bySubject.set(question.subject, subject);
    });
  }

  const hardestQuestions = [...byQuestion.values()]
    .filter((question) => question.wrong > 0)
    .sort(
      (a, b) =>
        b.wrong - a.wrong ||
        a.correct / a.attempts - b.correct / b.attempts ||
        (b.lastWrongAt?.getTime() ?? 0) - (a.lastWrongAt?.getTime() ?? 0),
    )
    .slice(0, 20)
    .map((item) => ({
      ministryId: item.ministryId,
      text: item.text,
      module: item.module,
      subject: item.subject,
      wrong: item.wrong,
      attempts: item.attempts,
      accuracy: percentage(item.correct, item.attempts),
      averageTimeMs: Math.round(item.totalTimeMs / item.attempts),
      correct: item.correct,
      omitted: item.omitted,
    }));

  const recent = completed.slice(-5);
  const previous = completed.slice(-10, -5);
  const recentAverage = average(recent.map((attempt) => attempt.summary!.score));
  const previousAverage = average(previous.map((attempt) => attempt.summary!.score));

  const activityMap = new Map<string, number>();
  for (const attempt of completed) {
    const day = attempt.completedAt!.toISOString().slice(0, 10);
    activityMap.set(day, (activityMap.get(day) ?? 0) + 1);
  }

  const reviewCorrect = reviewEvents.filter((event) => event.correct).length;
  const uniqueReviewed = new Set(
    reviewEvents.map((event) => event.questionId.toHexString()),
  ).size;
  const lastReview = reviewEvents.reduce<Date | undefined>(
    (latest, event) =>
      !latest || event.createdAt > latest ? event.createdAt : latest,
    undefined,
  );

  return {
    summary: {
      completed: completed.length,
      passed,
      passRate: percentage(passed, completed.length),
      averageScore: round(average(scores)),
      bestScore: scores.length ? Math.max(...scores) : null,
      lastScore: scores.at(-1) ?? null,
      averageMargin: round(average(margins)),
      totalActiveMs: activeTimes.reduce((sum, value) => sum + value, 0),
      averageActiveMs: round(average(activeTimes), 0),
      correct,
      wrong,
      omitted,
      sampleSize: completed.length,
    },
    trend: completed.map((attempt) => ({
      attemptId: attempt._id.toHexString(),
      date: attempt.completedAt!,
      score: attempt.summary!.score,
      threshold: attempt.summary!.threshold,
      passed: attempt.summary!.passed,
      module: attempt.module,
      examType: attempt.examType,
      activeMs: attempt.summary!.activeTimeMs,
    })),
    byModule: group((attempt) => attempt.module).map(({ key, ...item }) => ({
      module: key as Module,
      ...item,
    })),
    byExamType: group((attempt) => attempt.examType).map(({ key, ...item }) => ({
      examType: key as ExamType,
      ...item,
    })),
    bySubject: [...bySubject.entries()]
      .map(([subject, values]) => ({
        subject,
        answered: values.answered,
        correct: values.correct,
        wrong: values.wrong,
        omitted: values.omitted,
        accuracy: percentage(values.correct, values.answered),
        averageTimeMs: values.appearances
          ? Math.round(values.totalTimeMs / values.appearances)
          : 0,
      }))
      .sort((a, b) => b.answered - a.answered),
    recentComparison: {
      recent5Average: round(recentAverage),
      previous5Average: round(previousAverage),
      delta:
        recentAverage === null || previousAverage === null
          ? null
          : round(recentAverage - previousAverage),
    },
    coverage: {
      seen: seenQuestionIds.size,
      total: totalQuestionCount,
      percentage: percentage(seenQuestionIds.size, totalQuestionCount),
    },
    hardestQuestions,
    activity: [...activityMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, attempts: count })),
    review: {
      answers: reviewEvents.length,
      correct: reviewCorrect,
      accuracy: percentage(reviewCorrect, reviewEvents.length),
      uniqueQuestions: uniqueReviewed,
      lastActivityAt: lastReview ?? null,
    },
  };
}

export async function personalStats(
  userId: ObjectId,
  filter: { since?: Date; module?: Module; examType?: ExamType } = {},
) {
  const { attempts, reviewEvents, questions } = await collections();
  const attemptFilter: Filter<AttemptDocument> = {
    userId,
    status: { $in: ["completed", "expired"] },
    summary: { $exists: true },
    ...(filter.since ? { completedAt: { $gte: filter.since } } : {}),
    ...(filter.module ? { module: filter.module } : {}),
    ...(filter.examType ? { examType: filter.examType } : {}),
  };
  const questionFilter = {
    ...(filter.module ? { module: filter.module } : {}),
    ...(filter.examType ? { examType: filter.examType } : {}),
  };
  const [history, reviews, hashes] = await Promise.all([
    attempts.find(attemptFilter).toArray(),
    reviewEvents
      .find({
        userId,
        ...(filter.since ? { createdAt: { $gte: filter.since } } : {}),
        ...(filter.module ? { module: filter.module } : {}),
      })
      .toArray(),
    questions.distinct("contentHash", questionFilter),
  ]);
  return buildPersonalStats(history, reviews, hashes.length);
}
