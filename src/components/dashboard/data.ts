export type ExamTypeFilter = "all" | "initial" | "update";
export type ModuleFilter =
  | "all"
  | "general"
  | "cat145"
  | "cat8"
  | "cat9"
  | "cat10";
export type PeriodFilter = "30d" | "90d" | "1y" | "all";

export const moduleLabels: Record<Exclude<ModuleFilter, "all">, string> = {
  general: "Modulo generale",
  cat145: "Categorie 1 · 4 · 5",
  cat8: "Categoria 8",
  cat9: "Categoria 9",
  cat10: "Categoria 10",
};

export const examTypeLabels: Record<Exclude<ExamTypeFilter, "all">, string> = {
  initial: "Verifica iniziale",
  update: "Aggiornamento",
};

export type TrendPoint = {
  id?: string;
  date: string;
  score: number;
  threshold: number;
  passed: boolean;
  module?: string;
  examType?: string;
};

export type BreakdownPoint = {
  key: string;
  label: string;
  attempts: number;
  accuracy: number;
  averageScore?: number;
  passRate?: number;
};

export type PersonalStats = {
  generatedAt: string | null;
  sampleSize: number;
  summary: {
    completed: number;
    passed: number;
    passRate: number;
    averageScore: number;
    bestScore: number;
    latestScore: number;
    averageMargin: number;
    totalActiveSeconds: number;
    averageActiveSeconds: number;
    coverageRate: number;
    coveredQuestions: number;
    availableQuestions: number;
    recentDelta: number | null;
  };
  trend: TrendPoint[];
  byModule: BreakdownPoint[];
  byExamType: BreakdownPoint[];
  answerDistribution: {
    correct: number;
    wrong: number;
    omitted: number;
  };
  subjects: BreakdownPoint[];
  activity: Array<{ date: string; count: number }>;
  weakTopics: Array<{
    label: string;
    module?: string;
    attempts: number;
    accuracy: number;
  }>;
  mostMissed: Array<{
    questionId: string;
    subject: string;
    module?: string;
    misses: number;
    attempts: number;
    accuracy: number;
    averageTimeSeconds: number;
  }>;
  review: {
    answers: number;
    accuracy: number;
    questionsReviewed: number;
    lastActivityAt: string | null;
  };
};

export type AdminUser = {
  id: string;
  label: string;
  notes: string;
  role: "admin" | "user";
  active: boolean;
  codeHint: string;
  createdAt: string | null;
  loginCount: number;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  activeSessions: number;
  quizCount: number;
  averageScore: number;
  bestScore: number;
  passRate: number;
  totalActiveSeconds: number;
  revision?: number;
};

export type AdminStats = {
  generatedAt: string | null;
  summary: {
    totalUsers: number;
    activeUsers7d: number;
    activeUsers30d: number;
    logins: number;
    activeSessions: number;
    started: number;
    active: number;
    paused: number;
    openAttempts: number;
    completed: number;
    expired: number;
    completionRate: number;
    passRate: number;
    averageScore: number;
    averageActiveSeconds: number;
  };
  trend: Array<{
    date: string;
    logins: number;
    attempts: number;
  }>;
  byModule: BreakdownPoint[];
  byExamType: BreakdownPoint[];
  categoryUsage: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  users: AdminUser[];
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function first(source: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function numeric(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "active" || value === "enabled") return true;
  if (value === "inactive" || value === "disabled") return false;
  return fallback;
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function ratio(value: unknown): number {
  const parsed = numeric(value);
  return parsed > 1 ? parsed / 100 : parsed;
}

function unwrap(payload: unknown): JsonRecord {
  const outer = record(payload);
  const data = record(outer.data);
  return Object.keys(data).length > 0 ? data : outer;
}

function normalizeBreakdown(item: unknown, index: number): BreakdownPoint {
  const source = record(item);
  const key = text(
    first(source, "key", "module", "examType", "subject", "id"),
    `item-${index}`,
  );
  return {
    key,
    label: text(first(source, "label", "name", "title"), key),
    attempts: numeric(
      first(source, "attempts", "answered", "count", "sampleSize", "total"),
    ),
    accuracy: ratio(first(source, "accuracy", "accuracyRate", "correctRate")),
    averageScore: numeric(
      first(source, "averageScore", "avgScore", "score"),
      Number.NaN,
    ),
    passRate: ratio(first(source, "passRate", "passedRate")),
  };
}

export function normalizePersonalStats(payload: unknown): PersonalStats {
  const root = unwrap(payload);
  const summary = record(first(root, "summary", "overview", "kpis"));
  const answerPayload = first(
    root,
    "answerDistribution",
    "answers",
    "distribution",
  );
  const answers =
    answerPayload === undefined ? summary : record(answerPayload);
  const review = record(first(root, "review", "reviewStats"));
  const coverage = record(first(root, "coverage"));
  const recentComparison = record(first(root, "recentComparison"));
  const subjects = array(first(root, "subjects", "bySubject", "topics")).map(
    normalizeBreakdown,
  );
  const weakTopics = array(first(root, "weakTopics", "weakestTopics")).map(
    (item) => {
      const source = record(item);
      return {
        label: text(first(source, "label", "subject", "name"), "Argomento"),
        module: nullableText(first(source, "module")) ?? undefined,
        attempts: numeric(first(source, "attempts", "count")),
        accuracy: ratio(first(source, "accuracy", "accuracyRate")),
      };
    },
  );

  return {
    generatedAt: nullableText(first(root, "generatedAt", "updatedAt")),
    sampleSize: numeric(
      first(root, "sampleSize", "attemptCount"),
      numeric(
        first(summary, "sampleSize", "completed", "completedAttempts", "exams"),
      ),
    ),
    summary: {
      completed: numeric(
        first(summary, "completed", "completedAttempts", "exams"),
      ),
      passed: numeric(first(summary, "passed", "passedAttempts")),
      passRate: ratio(first(summary, "passRate", "successRate")),
      averageScore: numeric(first(summary, "averageScore", "avgScore")),
      bestScore: numeric(first(summary, "bestScore", "maxScore")),
      latestScore: numeric(first(summary, "latestScore", "lastScore")),
      averageMargin: numeric(first(summary, "averageMargin", "avgMargin")),
      totalActiveSeconds:
        first(summary, "totalActiveMs") !== undefined
          ? numeric(first(summary, "totalActiveMs")) / 1000
          : numeric(first(summary, "totalActiveSeconds", "totalTimeSeconds")),
      averageActiveSeconds:
        first(summary, "averageActiveMs") !== undefined
          ? numeric(first(summary, "averageActiveMs")) / 1000
          : numeric(first(summary, "averageActiveSeconds", "avgTimeSeconds")),
      coverageRate: ratio(
        first(
          coverage,
          "percentage",
          "coverageRate",
          "bankCoverage",
        ) ?? first(summary, "coverageRate", "bankCoverage"),
      ),
      coveredQuestions: numeric(
        first(coverage, "seen", "coveredQuestions", "questionsSeen") ??
          first(summary, "coveredQuestions", "questionsSeen"),
      ),
      availableQuestions: numeric(
        first(coverage, "total", "availableQuestions", "totalQuestions") ??
          first(summary, "availableQuestions", "totalQuestions"),
      ),
      recentDelta:
        (first(recentComparison, "delta") ??
          first(summary, "recentDelta", "lastFiveDelta")) === undefined
          ? null
          : numeric(
              first(recentComparison, "delta") ??
                first(summary, "recentDelta", "lastFiveDelta"),
            ),
    },
    trend: array(first(root, "trend", "scoreTrend", "attempts")).map((item) => {
      const source = record(item);
      return {
        id:
          nullableText(first(source, "attemptId", "id", "_id")) ?? undefined,
        date: text(first(source, "date", "completedAt", "createdAt")),
        score: numeric(first(source, "score", "points")),
        threshold: numeric(first(source, "threshold", "passingScore")),
        passed: bool(first(source, "passed", "isPassed")),
        module: nullableText(first(source, "module")) ?? undefined,
        examType: nullableText(first(source, "examType", "type")) ?? undefined,
      };
    }),
    byModule: array(first(root, "byModule", "modules")).map(normalizeBreakdown),
    byExamType: array(first(root, "byExamType", "examTypes")).map(
      normalizeBreakdown,
    ),
    answerDistribution: {
      correct: numeric(first(answers, "correct", "correctAnswers")),
      wrong: numeric(first(answers, "wrong", "incorrect", "wrongAnswers")),
      omitted: numeric(first(answers, "omitted", "skipped", "blank")),
    },
    subjects,
    activity: array(first(root, "activity", "calendar", "activityCalendar")).map(
      (item) => {
        const source = record(item);
        return {
          date: text(first(source, "date", "day")),
          count: numeric(first(source, "count", "attempts", "activity")),
        };
      },
    ),
    weakTopics:
      weakTopics.length > 0
        ? weakTopics
        : [...subjects]
            .filter((item) => item.attempts > 0)
            .sort(
              (a, b) =>
                a.accuracy - b.accuracy || b.attempts - a.attempts,
            )
            .slice(0, 6)
            .map((item) => ({
              label: item.label,
              attempts: item.attempts,
              accuracy: item.accuracy,
            })),
    mostMissed: array(
      first(root, "mostMissed", "mostMissedQuestions", "hardestQuestions"),
    ).map((item) => {
      const source = record(item);
      return {
        questionId: text(
          first(source, "questionId", "ministryId", "id"),
          "—",
        ),
        subject: text(first(source, "subject", "topic"), "Senza materia"),
        module: nullableText(first(source, "module")) ?? undefined,
        misses: numeric(first(source, "misses", "wrong", "wrongCount")),
        attempts: numeric(first(source, "attempts", "count")),
        accuracy: ratio(first(source, "accuracy", "accuracyRate")),
        averageTimeSeconds:
          first(source, "averageTimeMs", "avgTimeMs") !== undefined
            ? numeric(first(source, "averageTimeMs", "avgTimeMs")) / 1000
            : numeric(
                first(
                  source,
                  "averageTimeSeconds",
                  "avgTimeSeconds",
                ),
              ),
      };
    }),
    review: {
      answers: numeric(first(review, "answers", "totalAnswers")),
      accuracy: ratio(first(review, "accuracy", "accuracyRate")),
      questionsReviewed: numeric(
        first(review, "questionsReviewed", "uniqueQuestions"),
      ),
      lastActivityAt: nullableText(
        first(review, "lastActivityAt", "lastReviewedAt"),
      ),
    },
  };
}

export function normalizeAdminUser(item: unknown, index: number): AdminUser {
  const source = record(item);
  const status = first(source, "isActive", "active", "enabled", "status");
  const role = text(first(source, "role"), "user");
  return {
    id: text(first(source, "id", "_id", "userId"), `user-${index}`),
    label: text(first(source, "label", "name", "displayName"), "Utente"),
    notes: text(first(source, "notes", "note")),
    role: role === "admin" ? "admin" : "user",
    active: bool(status, true),
    codeHint: text(first(source, "codeHint")),
    createdAt: nullableText(first(source, "createdAt")),
    loginCount: numeric(first(source, "loginCount", "logins", "accessCount")),
    lastLoginAt: nullableText(first(source, "lastLoginAt", "lastLogin")),
    lastActivityAt: nullableText(
      first(source, "lastActivityAt", "lastSeenAt", "lastLoginAt"),
    ),
    activeSessions: numeric(first(source, "activeSessions")),
    quizCount: numeric(
      first(source, "quizCount", "completedAttempts", "attempts"),
    ),
    averageScore: numeric(first(source, "averageScore", "avgScore")),
    bestScore: numeric(first(source, "bestScore", "maxScore")),
    passRate: ratio(first(source, "passRate", "successRate")),
    totalActiveSeconds:
      first(source, "totalActiveMs") !== undefined
        ? numeric(first(source, "totalActiveMs")) / 1000
        : numeric(first(source, "totalActiveSeconds", "totalTimeSeconds")),
    revision:
      first(source, "revision") === undefined
        ? undefined
        : numeric(first(source, "revision")),
  };
}

export function normalizeAdminStats(payload: unknown): AdminStats {
  const root = unwrap(payload);
  const summary = record(first(root, "summary", "overview", "kpis"));
  const usersContainer = first(root, "users");
  const users = Array.isArray(usersContainer)
    ? usersContainer
    : array(first(record(usersContainer), "items", "results"));

  return {
    generatedAt: nullableText(first(root, "generatedAt", "updatedAt")),
    summary: {
      totalUsers: numeric(first(summary, "totalUsers", "users")),
      activeUsers7d: numeric(first(summary, "activeUsers7d", "active7d")),
      activeUsers30d: numeric(first(summary, "activeUsers30d", "active30d")),
      logins: numeric(first(summary, "logins7d", "logins", "loginCount")),
      activeSessions: numeric(
        first(summary, "activeSessions", "sessions", "sessionsActive"),
      ),
      started: numeric(
        first(summary, "startedAttempts", "started", "attemptsStarted"),
      ),
      active: numeric(
        first(summary, "activeAttempts", "active", "attemptsActive"),
      ),
      paused: numeric(
        first(summary, "pausedAttempts", "paused", "attemptsPaused"),
      ),
      openAttempts: numeric(
        first(summary, "openAttempts", "attemptsOpen"),
      ),
      completed: numeric(
        first(summary, "completedAttempts", "completed", "attemptsCompleted"),
      ),
      expired: numeric(
        first(summary, "expiredAttempts", "expired", "attemptsExpired"),
      ),
      completionRate: ratio(
        first(summary, "completionRate", "completedRate"),
      ),
      passRate: ratio(first(summary, "passRate", "successRate")),
      averageScore: numeric(first(summary, "averageScore", "avgScore")),
      averageActiveSeconds:
        numeric(first(summary, "completedAttempts", "completed")) +
          numeric(first(summary, "expiredAttempts", "expired")) >
          0 &&
        first(summary, "totalActiveMs") !== undefined
          ? numeric(first(summary, "totalActiveMs")) /
            1000 /
            (numeric(first(summary, "completedAttempts", "completed")) +
              numeric(first(summary, "expiredAttempts", "expired")))
          : numeric(first(summary, "averageActiveSeconds", "avgTimeSeconds")),
    },
    trend: array(
      first(root, "trend", "attemptTrend", "activityTrend", "activity"),
    ).map(
      (item) => {
        const source = record(item);
        return {
          date: text(first(source, "date", "day")),
          logins: numeric(first(source, "logins", "loginCount")),
          attempts: numeric(first(source, "attempts", "attemptCount")),
        };
      },
    ),
    byModule: array(first(root, "byModule", "modules")).map(normalizeBreakdown),
    byExamType: array(first(root, "byExamType", "examTypes")).map(
      normalizeBreakdown,
    ),
    categoryUsage: array(
      first(root, "categoryUsage", "moduleUsage", "usage"),
    ).map((item, index) => {
      const source = record(item);
      const key = text(first(source, "key", "module", "id"), `item-${index}`);
      return {
        key,
        label: text(first(source, "label", "name"), key),
        count: numeric(first(source, "count", "attempts", "total")),
      };
    }),
    users: users.map(normalizeAdminUser),
  };
}

export async function fetchDashboardJson(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const source = record(payload);
    const nestedError = record(source.error);
    const message = text(
      first(nestedError, "message", "detail") ??
        first(source, "message", "detail"),
      response.status === 403
        ? "Non hai i permessi necessari per questa sezione."
        : "La richiesta non è andata a buon fine.",
    );
    throw new Error(message);
  }
  return payload;
}
