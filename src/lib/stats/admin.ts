import { collections } from "@/lib/db/collections";
import type { AttemptDocument } from "@/types/domain";

function percent(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function average(values: number[]): number | null {
  return values.length
    ? Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
      ) / 100
    : null;
}

export async function adminStats(now = new Date(), since?: Date) {
  const { users, loginEvents, attempts, sessions } = await collections();
  const since7d = new Date(now.getTime() - 7 * 86_400_000);
  const since30d = new Date(now.getTime() - 30 * 86_400_000);
  const [
    userCount,
    active7Ids,
    active30Ids,
    logins7d,
    activeSessions,
    allAttempts,
    recentLogins,
  ] =
    await Promise.all([
      users.countDocuments({}),
      loginEvents.distinct("userId", {
        success: true,
        userId: { $exists: true },
        createdAt: { $gte: since7d },
      }),
      loginEvents.distinct("userId", {
        success: true,
        userId: { $exists: true },
        createdAt: { $gte: since30d },
      }),
      loginEvents.countDocuments({ success: true, createdAt: { $gte: since7d } }),
      sessions.countDocuments({
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
      }),
      attempts.find(since ? { startedAt: { $gte: since } } : {}).toArray(),
      loginEvents
        .find({
          success: true,
          createdAt: { $gte: since ?? since30d },
        })
        .project<{ createdAt: Date }>({ createdAt: 1 })
        .toArray(),
    ]);
  const finalAttempts = allAttempts.filter(
    (attempt) =>
      (attempt.status === "completed" || attempt.status === "expired") &&
      attempt.summary,
  );
  const completedAttempts = finalAttempts.filter(
    (attempt) => attempt.status === "completed",
  ).length;
  const expiredAttempts = finalAttempts.filter(
    (attempt) => attempt.status === "expired",
  ).length;
  const activeAttempts = allAttempts.filter(
    (attempt) => attempt.status === "active",
  ).length;
  const pausedAttempts = allAttempts.filter(
    (attempt) => attempt.status === "paused",
  ).length;
  const passed = finalAttempts.filter((attempt) => attempt.summary!.passed).length;

  const by = <K extends string>(key: (attempt: AttemptDocument) => K) => {
    const map = new Map<K, AttemptDocument[]>();
    for (const attempt of finalAttempts) {
      const value = key(attempt);
      map.set(value, [...(map.get(value) ?? []), attempt]);
    }
    return [...map.entries()].map(([value, items]) => ({
      key: value,
      attempts: items.length,
      passRate: percent(
        items.filter((item) => item.summary!.passed).length,
        items.length,
      ),
      averageScore: average(items.map((item) => item.summary!.score)),
      averageActiveMs: average(items.map((item) => item.summary!.activeTimeMs)),
    }));
  };

  const questions = new Map<
    string,
    {
      ministryId: string;
      text: string;
      module: string;
      subject: string;
      wrong: number;
      attempts: number;
      correct: number;
    }
  >();
  for (const attempt of finalAttempts) {
    attempt.questions.forEach((question, index) => {
      const result = attempt.responses[index]?.result;
      if (!result) return;
      const key = question.questionId.toHexString();
      const value = questions.get(key) ?? {
        ministryId: question.ministryId,
        text: question.text,
        module: attempt.module,
        subject: question.subject,
        wrong: 0,
        attempts: 0,
        correct: 0,
      };
      value.attempts += 1;
      if (result === "wrong") value.wrong += 1;
      if (result === "correct") value.correct += 1;
      questions.set(key, value);
    });
  }

  const activity = new Map<string, { logins: number; attempts: number }>();
  for (const login of recentLogins) {
    const date = login.createdAt.toISOString().slice(0, 10);
    const value = activity.get(date) ?? { logins: 0, attempts: 0 };
    value.logins += 1;
    activity.set(date, value);
  }
  for (const attempt of finalAttempts) {
    if (!attempt.completedAt || attempt.completedAt < (since ?? since30d)) continue;
    const date = attempt.completedAt.toISOString().slice(0, 10);
    const value = activity.get(date) ?? { logins: 0, attempts: 0 };
    value.attempts += 1;
    activity.set(date, value);
  }

  return {
    summary: {
      users: userCount,
      active7d: active7Ids.length,
      active30d: active30Ids.length,
      logins7d,
      activeSessions,
      startedAttempts: allAttempts.length,
      activeAttempts,
      pausedAttempts,
      openAttempts: activeAttempts + pausedAttempts,
      completedAttempts,
      expiredAttempts,
      completionRate: percent(finalAttempts.length, allAttempts.length),
      passRate: percent(passed, finalAttempts.length),
      averageScore: average(finalAttempts.map((attempt) => attempt.summary!.score)),
      totalActiveMs: finalAttempts.reduce(
        (sum, attempt) => sum + attempt.summary!.activeTimeMs,
        0,
      ),
    },
    byModule: by((attempt) => attempt.module).map(({ key, ...value }) => ({
      module: key,
      ...value,
    })),
    byExamType: by((attempt) => attempt.examType).map(({ key, ...value }) => ({
      examType: key,
      ...value,
    })),
    hardestQuestions: [...questions.values()]
      .filter((question) => question.wrong > 0)
      .sort(
        (a, b) =>
          b.wrong - a.wrong ||
          a.correct / a.attempts - b.correct / b.attempts,
      )
      .slice(0, 20)
      .map((question) => ({
        ...question,
        accuracy: percent(question.correct, question.attempts),
      })),
    activity: [...activity.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values })),
  };
}
