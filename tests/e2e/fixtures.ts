import type {
  BrowserContext,
  Page,
  Request as PlaywrightRequest,
  Route,
} from "@playwright/test";

export const BASE_URL = "http://127.0.0.1:3017";
export const ATTEMPT_ID = "e2e-attempt";

type ExamStatus = "not-started" | "active" | "paused" | "completed";

type QuizOption = {
  id: string;
  text: string;
};

type QuizQuestion = {
  id: string;
  ministerialId: string;
  position: number;
  subject: string;
  text: string;
  options: QuizOption[];
  selectedOptionId: string | null;
  visited: boolean;
};

type HistoryAttempt = {
  id: string;
  module: "general" | "cat145" | "cat8" | "cat9" | "cat10";
  examType: "initial" | "update";
  status: "completed" | "expired";
  score: number;
  threshold: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  omittedCount: number;
  activeSeconds: number;
  completedAt: string;
};

type ReviewQuestion = {
  id: string;
  ministerialId: string;
  module: "general" | "cat145" | "cat8" | "cat9" | "cat10";
  subject: string;
  text: string;
  options: QuizOption[];
  wrongCount: number;
  seenCount: number;
};

export type MockApiState = {
  status: ExamStatus;
  revision: number;
  remainingSeconds: number;
  module: "general" | "cat145" | "cat8" | "cat9" | "cat10";
  examType: "initial" | "update";
  questions: QuizQuestion[];
  history: HistoryAttempt[];
  reviewQuestions: ReviewQuestion[];
  requests: Array<{
    method: string;
    pathname: string;
    body: unknown;
  }>;
};

const longQuestion = [
  "Durante una verifica operativa su un trasporto di rifiuti, il responsabile tecnico",
  "deve valutare contemporaneamente la corretta classificazione del rifiuto, la",
  "coerenza tra formulario e autorizzazione, le condizioni del mezzo e la tracciabilità",
  "delle operazioni. Considerando che il produttore ha comunicato una variazione prima",
  "della partenza e che il destinatario ha imposto prescrizioni aggiuntive, quale",
  "comportamento consente di mantenere completa e verificabile la documentazione",
  "senza alterare le responsabilità previste dalla disciplina applicabile?",
].join(" ");

function makeQuestion(position: number): QuizQuestion {
  const id = `question-${position}`;
  const prefix = `q${position}`;
  return {
    id,
    ministerialId: `ALBO-2026-${String(position).padStart(4, "0")}`,
    position,
    subject:
      position % 2 === 0
        ? "Normativa e responsabilità"
        : "Gestione operativa dei rifiuti",
    text:
      position === 1
        ? longQuestion
        : `Quesito ufficiale di collaudo numero ${position}: individua l'opzione corretta nel caso descritto.`,
    options: [
      {
        id: `${prefix}-a`,
        text: `Opzione ufficiale A della domanda ${position}`,
      },
      {
        id: `${prefix}-b`,
        text: `Opzione ufficiale B della domanda ${position}`,
      },
      {
        id: `${prefix}-c`,
        text: `Opzione ufficiale C della domanda ${position}`,
      },
      {
        id: `${prefix}-d`,
        text: `Opzione ufficiale D della domanda ${position}`,
      },
    ],
    selectedOptionId: null,
    visited: false,
  };
}

export function createMockApiState(): MockApiState {
  return {
    status: "not-started",
    revision: 1,
    remainingSeconds: 3_548,
    module: "cat8",
    examType: "update",
    questions: Array.from({ length: 40 }, (_, index) =>
      makeQuestion(index + 1),
    ),
    history: [
      {
        id: "historic-cat8-passed",
        module: "cat8",
        examType: "update",
        status: "completed",
        score: 34,
        threshold: 28,
        passed: true,
        correctCount: 35,
        wrongCount: 2,
        omittedCount: 3,
        activeSeconds: 1_920,
        completedAt: "2026-07-29T15:00:00.000Z",
      },
      {
        id: "historic-cat145-failed",
        module: "cat145",
        examType: "initial",
        status: "expired",
        score: 29.5,
        threshold: 34,
        passed: false,
        correctCount: 31,
        wrongCount: 3,
        omittedCount: 6,
        activeSeconds: 3_600,
        completedAt: "2026-07-18T10:00:00.000Z",
      },
    ],
    reviewQuestions: [
      {
        id: "review-q1",
        ministerialId: "ALBO-RIPASSO-0001",
        module: "cat8",
        subject: "Normativa e responsabilità",
        text: "Quale adempimento mantiene verificabile la tracciabilità del trasporto?",
        options: [
          { id: "review-q1-a", text: "L'adempimento ufficiale corretto" },
          { id: "review-q1-b", text: "Un adempimento non sufficiente" },
          { id: "review-q1-c", text: "Una procedura non pertinente" },
          { id: "review-q1-d", text: "Nessun adempimento" },
        ],
        wrongCount: 7,
        seenCount: 10,
      },
      {
        id: "review-q2",
        ministerialId: "ALBO-RIPASSO-0002",
        module: "cat145",
        subject: "Gestione operativa dei rifiuti",
        text: "Quale controllo deve essere completato prima della partenza?",
        options: [
          { id: "review-q2-a", text: "Il controllo ufficiale corretto" },
          { id: "review-q2-b", text: "Un controllo successivo" },
          { id: "review-q2-c", text: "Un controllo facoltativo" },
          { id: "review-q2-d", text: "Nessun controllo" },
        ],
        wrongCount: 4,
        seenCount: 8,
      },
    ],
    requests: [],
  };
}

export async function addSessionCookie(context: BrowserContext) {
  await context.addCookies([
    {
      name: "rtlab_session",
      value: "e2e-session-token",
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

function activeAttempt(state: MockApiState) {
  return {
    id: ATTEMPT_ID,
    status: state.status,
    module: state.module,
    examType: state.examType,
    threshold: state.examType === "update" ? 28 : 34,
    revision: state.revision,
    remainingSeconds: state.remainingSeconds,
    questions: state.questions,
  };
}

function openAttemptSummary(state: MockApiState) {
  if (state.status !== "active" && state.status !== "paused") {
    return { attempt: null };
  }
  return {
    attempt: {
      id: ATTEMPT_ID,
      module: state.module,
      examType: state.examType,
      status: state.status,
      answeredCount: state.questions.filter(
        (question) => question.selectedOptionId !== null,
      ).length,
      remainingSeconds: state.remainingSeconds,
      updatedAt: "2026-07-30T09:45:00.000Z",
    },
  };
}

function completedResult(state: MockApiState) {
  const questions = state.questions.map((question) => {
    const correctOptionId = `q${question.position}-a`;
    const result =
      question.selectedOptionId === null
        ? ("omitted" as const)
        : question.selectedOptionId === correctOptionId
          ? ("correct" as const)
          : ("wrong" as const);
    return {
      ...question,
      correctOptionId,
      result,
    };
  });
  const correctCount = questions.filter(
    (question) => question.result === "correct",
  ).length;
  const wrongCount = questions.filter(
    (question) => question.result === "wrong",
  ).length;
  const omittedCount = questions.filter(
    (question) => question.result === "omitted",
  ).length;
  const score = correctCount - wrongCount * 0.5;
  return {
    id: ATTEMPT_ID,
    module: state.module,
    examType: state.examType,
    status: "completed",
    score,
    threshold: 28,
    passed: score >= 28,
    correctCount,
    wrongCount,
    omittedCount,
    activeSeconds: 780,
    pausedSeconds: 42,
    questions,
  };
}

export const personalStats = {
  displayName: "Ada Lovelace",
  generatedAt: "2026-07-30T10:00:00.000Z",
  sampleSize: 12,
  summary: {
    completed: 12,
    passed: 9,
    passRate: 0.75,
    averageScore: 32.4,
    bestScore: 37.5,
    latestScore: 34,
    averageMargin: 1.8,
    totalActiveSeconds: 24_120,
    averageActiveSeconds: 2_010,
    coverageRate: 0.42,
    coveredQuestions: 212,
    availableQuestions: 505,
    recentDelta: 1.6,
  },
  recent: [
    {
      id: "historic-1",
      module: "cat8",
      examType: "update",
      status: "completed",
      score: 34,
      threshold: 28,
      completedAt: "2026-07-29T15:00:00.000Z",
    },
  ],
  trend: [
    {
      date: "2026-07-15",
      score: 30,
      threshold: 28,
      passed: true,
      module: "cat8",
      examType: "update",
    },
    {
      date: "2026-07-29",
      score: 34,
      threshold: 28,
      passed: true,
      module: "cat8",
      examType: "update",
    },
  ],
  byModule: [
    {
      key: "cat8",
      label: "Categoria 8",
      attempts: 8,
      accuracy: 0.82,
      averageScore: 33.1,
      passRate: 0.75,
    },
    {
      key: "cat145",
      label: "Categorie 1 · 4 · 5",
      attempts: 4,
      accuracy: 0.7,
      averageScore: 30.8,
      passRate: 0.5,
    },
  ],
  byExamType: [
    {
      key: "initial",
      label: "Verifica iniziale",
      attempts: 5,
      accuracy: 0.72,
      averageScore: 31.2,
      passRate: 0.6,
    },
    {
      key: "update",
      label: "Aggiornamento",
      attempts: 7,
      accuracy: 0.84,
      averageScore: 33.3,
      passRate: 0.86,
    },
  ],
  answerDistribution: {
    correct: 370,
    wrong: 82,
    omitted: 28,
  },
  subjects: [
    {
      key: "normativa",
      label: "Normativa e responsabilità",
      attempts: 140,
      accuracy: 0.68,
    },
    {
      key: "gestione",
      label: "Gestione operativa dei rifiuti",
      attempts: 160,
      accuracy: 0.83,
    },
  ],
  activity: [
    { date: "2026-07-15", count: 1 },
    { date: "2026-07-29", count: 2 },
  ],
  weakTopics: [
    {
      label: "Normativa e responsabilità",
      module: "cat8",
      attempts: 14,
      accuracy: 0.57,
    },
  ],
  mostMissed: [
    {
      questionId: "ministerial-44",
      subject: "Normativa e responsabilità",
      module: "cat8",
      misses: 5,
      attempts: 8,
      accuracy: 0.375,
    },
  ],
  review: {
    answers: 34,
    accuracy: 0.79,
    questionsReviewed: 18,
    lastActivityAt: "2026-07-29T18:00:00.000Z",
  },
};

export const adminStats = {
  generatedAt: "2026-07-30T10:00:00.000Z",
  summary: {
    totalUsers: 18,
    activeUsers7d: 11,
    activeUsers30d: 16,
    logins: 43,
    openAttempts: 3,
    completed: 96,
    expired: 4,
    completionRate: 0.96,
    passRate: 0.73,
    averageScore: 32.1,
    averageActiveSeconds: 2_120,
  },
  trend: [
    { date: "2026-07-28", logins: 8, attempts: 5 },
    { date: "2026-07-29", logins: 10, attempts: 7 },
  ],
  byModule: [
    {
      key: "cat8",
      label: "Categoria 8",
      attempts: 42,
      accuracy: 0.79,
      averageScore: 32.8,
      passRate: 0.76,
    },
    {
      key: "cat145",
      label: "Categorie 1 · 4 · 5",
      attempts: 31,
      accuracy: 0.72,
      averageScore: 31.4,
      passRate: 0.68,
    },
  ],
  byExamType: [
    {
      key: "initial",
      label: "Verifica iniziale",
      attempts: 52,
      accuracy: 0.73,
      averageScore: 31.6,
      passRate: 0.69,
    },
    {
      key: "update",
      label: "Aggiornamento",
      attempts: 44,
      accuracy: 0.81,
      averageScore: 32.9,
      passRate: 0.78,
    },
  ],
  categoryUsage: [
    { key: "cat8", label: "Categoria 8", count: 42 },
  ],
};

export const adminUsers = {
  users: [
    {
      id: "user-ada",
      label: "Ada Lovelace",
      notes: "Gruppo luglio",
      role: "admin",
      active: true,
      codeHint: "ADA••••2026",
      createdAt: "2026-06-01T08:00:00.000Z",
      loginCount: 18,
      lastLoginAt: "2026-07-30T09:15:00.000Z",
      lastActivityAt: "2026-07-30T09:45:00.000Z",
      activeSessions: 1,
      quizCount: 12,
      averageScore: 32.4,
      bestScore: 37.5,
      passRate: 0.75,
      totalActiveSeconds: 24_120,
      revision: 3,
    },
    {
      id: "user-bruno",
      label: "Bruno Rossi",
      notes: "Corso serale",
      role: "user",
      active: false,
      codeHint: "BRU••••2026",
      createdAt: "2026-06-12T08:00:00.000Z",
      loginCount: 7,
      lastLoginAt: "2026-07-26T17:15:00.000Z",
      lastActivityAt: "2026-07-26T18:00:00.000Z",
      activeSessions: 0,
      quizCount: 5,
      averageScore: 28.7,
      bestScore: 33,
      passRate: 0.4,
      totalActiveSeconds: 10_100,
      revision: 2,
    },
  ],
};

async function requestBody(request: PlaywrightRequest): Promise<unknown> {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ data: body }),
  });
}

export async function installApiMocks(page: Page, state: MockApiState) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    const body = await requestBody(request);
    state.requests.push({ method, pathname, body });

    if (pathname === "/api/auth/login" && method === "POST") {
      await addSessionCookie(page.context());
      await fulfillJson(route, {
        user: {
          id: "user-ada",
          displayName: "Ada Lovelace",
          role: "admin",
        },
      });
      return;
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      await fulfillJson(route, {
        user: {
          id: "user-ada",
          displayName: "Ada Lovelace",
          role: "admin",
        },
      });
      return;
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      await page.context().clearCookies();
      await fulfillJson(route, { ok: true });
      return;
    }

    if (pathname === "/api/stats/me" && method === "GET") {
      await fulfillJson(route, personalStats);
      return;
    }

    if (pathname === "/api/admin/stats" && method === "GET") {
      await fulfillJson(route, adminStats);
      return;
    }

    if (pathname === "/api/admin/users" && method === "GET") {
      await fulfillJson(route, adminUsers);
      return;
    }

    if (pathname === "/api/history" && method === "GET") {
      await fulfillJson(route, {
        items: state.history,
        total: state.history.length,
      });
      return;
    }

    if (pathname.startsWith("/api/history/") && method === "DELETE") {
      const id = pathname.slice("/api/history/".length);
      state.history = state.history.filter((attempt) => attempt.id !== id);
      await fulfillJson(route, { deleted: true });
      return;
    }

    if (pathname === "/api/review" && method === "GET") {
      const requestedModule = url.searchParams.get("module");
      const items =
        requestedModule && requestedModule !== "all"
          ? state.reviewQuestions.filter(
              (question) => question.module === requestedModule,
            )
          : state.reviewQuestions;
      await fulfillJson(route, {
        items,
        metrics: {
          available: items.length,
          reviewed: 0,
          correct: 0,
        },
      });
      return;
    }

    if (pathname === "/api/review" && method === "POST") {
      const payload = (body ?? {}) as {
        questionId?: string;
        optionId?: string;
      };
      const question = state.reviewQuestions.find(
        (item) => item.id === payload.questionId,
      );
      const correctOptionId = question
        ? `${question.id}-a`
        : "missing-question-a";
      await fulfillJson(route, {
        correct: payload.optionId === correctOptionId,
        correctOptionId,
      });
      return;
    }

    if (pathname === "/api/attempts" && method === "GET") {
      await fulfillJson(route, openAttemptSummary(state));
      return;
    }

    if (pathname === "/api/attempts" && method === "POST") {
      state.status = "active";
      state.module = "cat8";
      state.examType = "update";
      await fulfillJson(route, { id: ATTEMPT_ID });
      return;
    }

    if (pathname === `/api/attempts/${ATTEMPT_ID}` && method === "GET") {
      await fulfillJson(
        route,
        state.status === "completed"
          ? completedResult(state)
          : activeAttempt(state),
      );
      return;
    }

    if (
      pathname === `/api/attempts/${ATTEMPT_ID}/answer` &&
      method === "POST"
    ) {
      const payload = (body ?? {}) as {
        questionId?: string;
        optionId?: string | null;
        visited?: boolean;
      };
      const question = state.questions.find(
        (item) => item.id === payload.questionId,
      );
      if (question) {
        question.selectedOptionId = payload.optionId ?? null;
        question.visited = payload.visited ?? true;
      }
      state.revision += 1;
      await fulfillJson(route, { revision: state.revision });
      return;
    }

    if (
      pathname === `/api/attempts/${ATTEMPT_ID}/pause` &&
      method === "POST"
    ) {
      state.status = "paused";
      state.revision += 1;
      await fulfillJson(route, { revision: state.revision });
      return;
    }

    if (
      pathname === `/api/attempts/${ATTEMPT_ID}/resume` &&
      method === "POST"
    ) {
      state.status = "active";
      state.revision += 1;
      await fulfillJson(route, activeAttempt(state));
      return;
    }

    if (
      pathname === `/api/attempts/${ATTEMPT_ID}/complete` &&
      method === "POST"
    ) {
      state.status = "completed";
      state.revision += 1;
      await fulfillJson(route, completedResult(state));
      return;
    }

    await fulfillJson(
      route,
      { error: { message: `Mock non configurato: ${method} ${pathname}` } },
      404,
    );
  });
}
