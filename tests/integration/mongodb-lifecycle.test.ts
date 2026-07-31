import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import type {
  QuestionBankDocument,
  QuestionDocument,
} from "@/types/domain";

const TEST_URI = process.env.MONGODB_TEST_URI;
const DATABASE_NAME = `rt_lab_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const APP_URL = "http://localhost:3000";
const ADMIN_CODE = "Admin-Test-2026";
const USER_CODE = "Utente-Test-2026";
const CHANGED_USER_CODE = "Utente-Nuovo-2027";

function assertSafeTestDatabaseName(name: string): void {
  if (!/^rt_lab_test_[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      `Database di integrazione non sicuro: "${name}". Il nome deve iniziare con rt_lab_test_.`,
    );
  }
}

function loginRequest(code: string): NextRequest {
  return new NextRequest(`${APP_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ code }),
    headers: {
      "content-type": "application/json",
      origin: APP_URL,
      "user-agent": "rt-lab-vitest-integration",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

function authenticatedRequest(
  token: string,
  path = "/api/auth/me",
  method = "GET",
): NextRequest {
  return new NextRequest(`${APP_URL}${path}`, {
    method,
    headers: {
      cookie: `rtlab_session=${token}`,
      origin: APP_URL,
      "user-agent": "rt-lab-vitest-integration",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

function sessionToken(response: Response): string {
  const header = response.headers.get("set-cookie");
  const match = header?.match(/(?:^|,\s*)rtlab_session=([^;]+)/);
  if (!match?.[1]) {
    throw new Error("Il login non ha restituito il cookie di sessione.");
  }
  return decodeURIComponent(match[1]);
}

async function expectApiCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}

let bootstrapDatabase: typeof import("@/lib/db/bootstrap").bootstrapDatabase;
let bootstrapFirstAdmin: typeof import("@/lib/admin/bootstrap").bootstrapFirstAdmin;
let createUser: typeof import("@/lib/admin/users").createUser;
let changeUserCode: typeof import("@/lib/admin/users").changeUserCode;
let revokeUserSessions: typeof import("@/lib/admin/users").revokeUserSessions;
let login: typeof import("@/app/api/auth/login/route").POST;
let logout: typeof import("@/app/api/auth/logout/route").POST;
let getCurrentUser: typeof import("@/app/api/auth/me/route").GET;
let requireUser: typeof import("@/lib/auth/sessions").requireUser;
let digestSessionToken: typeof import("@/lib/auth/sessions").digestSessionToken;
let collections: typeof import("@/lib/db/collections").collections;
let getDb: typeof import("@/lib/db/client").getDb;
let closeMongoClient: typeof import("@/lib/db/client").closeMongoClient;
let startAttempt: typeof import("@/lib/exams/attempts").startAttempt;
let saveAnswer: typeof import("@/lib/exams/attempts").saveAnswer;
let pauseAttempt: typeof import("@/lib/exams/attempts").pauseAttempt;
let resumeAttempt: typeof import("@/lib/exams/attempts").resumeAttempt;
let completeAttempt: typeof import("@/lib/exams/attempts").completeAttempt;
let getAttempt: typeof import("@/lib/exams/attempts").getAttempt;
let deleteAttempt: typeof import("@/lib/exams/attempts").deleteAttempt;
let listHistory: typeof import("@/lib/exams/attempts").listHistory;
let personalStats: typeof import("@/lib/stats/personal").personalStats;

let adminId: ObjectId;
let userId: ObjectId;

describe.skipIf(!TEST_URI)("MongoDB integration — auth and exam lifecycle", () => {
  beforeAll(async () => {
    assertSafeTestDatabaseName(DATABASE_NAME);

    process.env.MONGODB_URI = TEST_URI;
    process.env.MONGODB_DB = DATABASE_NAME;
    process.env.APP_URL = APP_URL;
    process.env.AUTH_PEPPER = "integration-auth-pepper-0123456789abcdef";
    process.env.SESSION_PEPPER = "integration-session-pepper-0123456789abcdef";
    process.env.CODE_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
    Object.assign(process.env, { NODE_ENV: "test" });

    const configModule = await import("@/lib/config");
    configModule.resetConfigForTests();

    ({
      bootstrapDatabase,
    } = await import("@/lib/db/bootstrap"));
    ({
      bootstrapFirstAdmin,
    } = await import("@/lib/admin/bootstrap"));
    ({
      createUser,
      changeUserCode,
      revokeUserSessions,
    } = await import("@/lib/admin/users"));
    ({ POST: login } = await import("@/app/api/auth/login/route"));
    ({ POST: logout } = await import("@/app/api/auth/logout/route"));
    ({ GET: getCurrentUser } = await import("@/app/api/auth/me/route"));
    ({
      requireUser,
      digestSessionToken,
    } = await import("@/lib/auth/sessions"));
    ({ collections } = await import("@/lib/db/collections"));
    ({
      getDb,
      closeMongoClient,
    } = await import("@/lib/db/client"));
    ({
      startAttempt,
      saveAnswer,
      pauseAttempt,
      resumeAttempt,
      completeAttempt,
      getAttempt,
      deleteAttempt,
      listHistory,
    } = await import("@/lib/exams/attempts"));
    ({ personalStats } = await import("@/lib/stats/personal"));

    await bootstrapDatabase();
    const admin = await bootstrapFirstAdmin("Amministratore Test", ADMIN_CODE);
    adminId = new ObjectId(admin.id);
    const createdUser = await createUser(adminId, {
      name: "Utente Integrazione",
      code: USER_CODE,
      role: "user",
      notes: "Record temporaneo della suite MongoDB",
    });
    userId = new ObjectId(createdUser.id);

    const { questionBanks, questions } = await collections();
    const now = new Date();
    const bank: QuestionBankDocument = {
      _id: new ObjectId(),
      bankId: "integration-initial-general",
      version: "test-v1",
      examType: "initial",
      module: "general",
      status: "active",
      questionCount: 42,
      sourceUrls: ["https://example.invalid/rt-lab-integration"],
      sourceSha256: "0".repeat(64),
      importedAt: now,
      activatedAt: now,
    };
    await questionBanks.insertOne(bank);

    const fixtures: QuestionDocument[] = Array.from(
      { length: 42 },
      (_, index) => {
        const contentIndex = index === 41 ? 0 : index;
        const optionPrefix = `test-${index + 1}`;
        return {
          _id: new ObjectId(),
          bankId: bank.bankId,
          bankVersion: bank.version,
          examType: "initial",
          module: "general",
          subject: index % 2 === 0 ? "Normativa" : "Gestione ambientale",
          subtopic: `Argomento ${index % 5}`,
          ministryId: `TEST-${String(index + 1).padStart(4, "0")}`,
          rawText: `Testo grezzo domanda ${index + 1}`,
          text: `Domanda di integrazione numero ${index + 1}?`,
          options: [
            { id: `${optionPrefix}-a`, text: "Risposta ufficiale corretta" },
            { id: `${optionPrefix}-b`, text: "Distrattore B" },
            { id: `${optionPrefix}-c`, text: "Distrattore C" },
            { id: `${optionPrefix}-d`, text: "Distrattore D" },
          ],
          correctOptionId: `${optionPrefix}-a`,
          revision: 1,
          sourceUrl: "https://example.invalid/rt-lab-integration",
          sourceSha256: "0".repeat(64),
          contentHash: `integration-content-${contentIndex}`,
          createdAt: now,
        };
      },
    );
    await questions.insertMany(fixtures);
  }, 60_000);

  afterAll(async () => {
    if (!getDb || !closeMongoClient) return;
    assertSafeTestDatabaseName(DATABASE_NAME);
    try {
      const db = await getDb();
      if (db.databaseName !== DATABASE_NAME) {
        throw new Error(
          `Cleanup rifiutato: atteso "${DATABASE_NAME}", ricevuto "${db.databaseName}".`,
        );
      }
      await db.dropDatabase();
    } finally {
      await closeMongoClient();
    }
  }, 30_000);

  it("crea indici e policy idempotenti, poi gestisce login, rolling session, ruoli, revoca, logout e cambio codice", async () => {
    await bootstrapDatabase();

    const db = await getDb();
    const sessionIndexes = await db.collection("sessions").indexes();
    const attemptIndexes = await db.collection("attempts").indexes();
    expect(sessionIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sessions_token_unique",
          unique: true,
        }),
        expect.objectContaining({
          name: "sessions_expiry_ttl",
          expireAfterSeconds: 0,
        }),
      ]),
    );
    expect(attemptIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "attempts_one_open_per_user",
          unique: true,
        }),
      ]),
    );
    expect(await db.collection("examPolicies").countDocuments()).toBe(3);
    await expectApiCode(
      bootstrapFirstAdmin("Altro Admin", "Altro-Admin-2026"),
      "ADMIN_ALREADY_EXISTS",
    );

    const adminLogin = await login(loginRequest(ADMIN_CODE.toLowerCase()));
    expect(adminLogin.status).toBe(200);
    expect(sessionToken(adminLogin)).toHaveLength(43);

    const userLogin = await login(loginRequest(USER_CODE.toLowerCase()));
    expect(userLogin.status).toBe(200);
    const token = sessionToken(userLogin);
    const context = await requireUser(authenticatedRequest(token));
    expect(context.user).toMatchObject({
      id: userId.toHexString(),
      name: "Utente Integrazione",
      role: "user",
    });

    const { sessions, users, loginEvents } = await collections();
    const tokenDigest = digestSessionToken(token);
    const nearExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await sessions.updateOne(
      { tokenDigest },
      { $set: { expiresAt: nearExpiry } },
    );

    const rollingContext = await requireUser(authenticatedRequest(token));
    expect(rollingContext.refreshCookie).toBe(true);
    expect(rollingContext.session.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 300 * 24 * 60 * 60 * 1000,
    );

    await sessions.updateOne(
      { tokenDigest },
      { $set: { expiresAt: nearExpiry } },
    );
    const rollingResponse = await getCurrentUser(authenticatedRequest(token));
    expect(rollingResponse.status).toBe(200);
    expect(rollingResponse.headers.get("set-cookie")).toContain(
      `rtlab_session=${token}`,
    );

    const userBeforeChange = await users.findOne({ _id: userId });
    if (!userBeforeChange) throw new Error("Utente fixture non trovato.");
    const changed = await changeUserCode(
      adminId,
      userId,
      userBeforeChange.revision,
      CHANGED_USER_CODE,
    );
    expect(changed.revision).toBe(userBeforeChange.revision + 1);
    await expectApiCode(
      requireUser(authenticatedRequest(token)),
      "SESSION_INVALID",
    );
    expect(
      await sessions.countDocuments({
        userId,
        revokedAt: { $exists: true },
      }),
    ).toBeGreaterThanOrEqual(1);

    const changedLogin = await login(
      loginRequest(CHANGED_USER_CODE.toUpperCase()),
    );
    expect(changedLogin.status).toBe(200);
    const changedToken = sessionToken(changedLogin);
    expect(await loginEvents.countDocuments({ userId, success: true })).toBe(2);
    await expectApiCode(
      requireUser(authenticatedRequest(changedToken), "admin"),
      "FORBIDDEN",
    );

    const revoked = await revokeUserSessions(adminId, userId);
    expect(revoked.revoked).toBe(1);
    await expectApiCode(
      requireUser(authenticatedRequest(changedToken)),
      "SESSION_INVALID",
    );

    const logoutLogin = await login(loginRequest(CHANGED_USER_CODE));
    const logoutToken = sessionToken(logoutLogin);
    const logoutResponse = await logout(
      authenticatedRequest(logoutToken, "/api/auth/logout", "POST"),
    );
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toMatch(
      /rtlab_session=;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/i,
    );
    await expectApiCode(
      requireUser(authenticatedRequest(logoutToken)),
      "SESSION_INVALID",
    );
  }, 60_000);

  it("copre avvio, idempotenza, conflitti, pausa, ripresa, conclusione, scadenza, cancellazione e statistiche", async () => {
    const startedAt = new Date("2031-01-01T10:00:00.000Z");
    const startOperation = "integration-start-0001";
    const started = await startAttempt(
      userId,
      "initial",
      "general",
      startOperation,
      startedAt,
    );
    expect(started.status).toBe("active");
    expect(started.questions).toHaveLength(40);
    expect(started.revision).toBe(1);
    expect(JSON.stringify(started)).not.toContain("correctOptionId");
    expect(JSON.stringify(started)).not.toContain("correctOption");
    for (const question of started.questions) {
      expect(question.options).toHaveLength(4);
      expect(question).not.toHaveProperty("correctOptionId");
    }

    const idempotentStart = await startAttempt(
      userId,
      "initial",
      "general",
      startOperation,
      new Date(startedAt.getTime() + 100),
    );
    expect(idempotentStart.id).toBe(started.id);
    expect(idempotentStart.revision).toBe(1);
    await expectApiCode(
      startAttempt(
        userId,
        "initial",
        "general",
        "integration-start-0002",
        new Date(startedAt.getTime() + 200),
      ),
      "OPEN_ATTEMPT_EXISTS",
    );

    const attemptId = new ObjectId(started.id);
    const { attempts } = await collections();
    const storedStarted = await attempts.findOne({ _id: attemptId });
    if (!storedStarted) throw new Error("Tentativo appena creato non trovato.");
    expect(
      new Set(storedStarted.questions.map((question) => question.contentHash)).size,
    ).toBe(40);

    const firstCorrect = storedStarted.questions[0]?.correctOptionId;
    const secondQuestion = storedStarted.questions[1];
    const secondWrong = secondQuestion?.options.find(
      (option) => option.id !== secondQuestion.correctOptionId,
    )?.id;
    if (!firstCorrect || !secondWrong) {
      throw new Error("Fixture risposte non valida.");
    }

    const firstAnswer = await saveAnswer(
      attemptId,
      userId,
      {
        revision: 1,
        questionIndex: 0,
        selectedOptionId: firstCorrect,
        timeSpentMs: 900,
      },
      "integration-answer-0001",
      new Date(startedAt.getTime() + 1_000),
    );
    expect(firstAnswer.revision).toBe(2);

    const idempotentAnswer = await saveAnswer(
      attemptId,
      userId,
      {
        revision: 1,
        questionIndex: 0,
        selectedOptionId: firstCorrect,
        timeSpentMs: 900,
      },
      "integration-answer-0001",
      new Date(startedAt.getTime() + 1_100),
    );
    expect(idempotentAnswer.revision).toBe(2);
    await expectApiCode(
      saveAnswer(
        attemptId,
        userId,
        {
          revision: 1,
          questionIndex: 1,
          selectedOptionId: secondWrong,
        },
        "integration-answer-conflict",
        new Date(startedAt.getTime() + 1_200),
      ),
      "REVISION_CONFLICT",
    );

    const secondAnswer = await saveAnswer(
      attemptId,
      userId,
      {
        revision: 2,
        questionIndex: 1,
        selectedOptionId: secondWrong,
        timeSpentMs: 1_100,
      },
      "integration-answer-0002",
      new Date(startedAt.getTime() + 2_000),
    );
    expect(secondAnswer.revision).toBe(3);

    const paused = await pauseAttempt(
      attemptId,
      userId,
      3,
      "integration-pause-0001",
      new Date(startedAt.getTime() + 3_000),
    );
    expect(paused).toMatchObject({ status: "paused", revision: 4 });
    const idempotentPause = await pauseAttempt(
      attemptId,
      userId,
      3,
      "integration-pause-0001",
      new Date(startedAt.getTime() + 3_500),
    );
    expect(idempotentPause).toMatchObject({ status: "paused", revision: 4 });
    await expectApiCode(
      saveAnswer(
        attemptId,
        userId,
        {
          revision: 4,
          questionIndex: 2,
          selectedOptionId: null,
        },
        "integration-paused-answer",
        new Date(startedAt.getTime() + 4_000),
      ),
      "ATTEMPT_NOT_ACTIVE",
    );

    const resumed = await resumeAttempt(
      attemptId,
      userId,
      4,
      "integration-resume-0001",
      new Date(startedAt.getTime() + 5_000),
    );
    expect(resumed).toMatchObject({ status: "active", revision: 5 });
    if (resumed.status !== "active") {
      throw new Error(`Stato inatteso dopo la ripresa: ${resumed.status}`);
    }
    expect(resumed.pausedElapsedMs).toBe(2_000);
    const idempotentResume = await resumeAttempt(
      attemptId,
      userId,
      4,
      "integration-resume-0001",
      new Date(startedAt.getTime() + 5_100),
    );
    expect(idempotentResume).toMatchObject({ status: "active", revision: 5 });

    await expectApiCode(
      completeAttempt(
        attemptId,
        userId,
        5,
        false,
        "integration-complete-unconfirmed",
        new Date(startedAt.getTime() + 7_000),
      ),
      "COMPLETION_CONFIRMATION_REQUIRED",
    );
    const completed = await completeAttempt(
      attemptId,
      userId,
      5,
      true,
      "integration-complete-0001",
      new Date(startedAt.getTime() + 8_000),
    );
    expect(completed.status).toBe("completed");
    if (completed.status !== "completed") {
      throw new Error("Il tentativo doveva essere completato.");
    }
    expect(completed.summary).toMatchObject({
      score: 0.5,
      threshold: 32,
      passed: false,
      correct: 1,
      wrong: 1,
      omitted: 38,
      activeTimeMs: 6_000,
      pausedTimeMs: 2_000,
    });
    expect(completed.questions[0]).toHaveProperty("correctOptionId");

    const idempotentComplete = await completeAttempt(
      attemptId,
      userId,
      5,
      true,
      "integration-complete-0001",
      new Date(startedAt.getTime() + 9_000),
    );
    expect(idempotentComplete).toMatchObject({
      id: completed.id,
      status: "completed",
      revision: 6,
    });

    const secondStartedAt = new Date(startedAt.getTime() + 20_000);
    const expiring = await startAttempt(
      userId,
      "initial",
      "general",
      "integration-expiry-start",
      secondStartedAt,
    );
    expect(expiring.status).toBe("active");
    const expired = await getAttempt(
      new ObjectId(expiring.id),
      userId,
      new Date(secondStartedAt.getTime() + 60 * 60 * 1_000 + 1),
    );
    expect(expired.status).toBe("expired");
    if (expired.status !== "expired") {
      throw new Error("Il tentativo doveva essere scaduto.");
    }
    expect(expired.summary).toMatchObject({
      score: 0,
      correct: 0,
      wrong: 0,
      omitted: 40,
      activeTimeMs: 60 * 60 * 1_000,
    });

    const history = await listHistory(userId, { limit: 10 });
    expect(history.attempts).toHaveLength(2);
    expect(history.attempts.map((attempt) => attempt.status).sort()).toEqual([
      "completed",
      "expired",
    ]);

    const statsBeforeDelete = await personalStats(userId);
    expect(statsBeforeDelete.summary).toMatchObject({
      completed: 2,
      passed: 0,
      correct: 1,
      wrong: 1,
      omitted: 78,
      sampleSize: 2,
    });

    await deleteAttempt(attemptId, userId);
    await deleteAttempt(attemptId, userId);
    const statsAfterOneDelete = await personalStats(userId);
    expect(statsAfterOneDelete.summary).toMatchObject({
      completed: 1,
      correct: 0,
      wrong: 0,
      omitted: 40,
      sampleSize: 1,
    });

    await deleteAttempt(new ObjectId(expiring.id), userId);
    await deleteAttempt(new ObjectId(expiring.id), userId);
    const statsAfterAllDeletes = await personalStats(userId);
    expect(statsAfterAllDeletes.summary).toMatchObject({
      completed: 0,
      correct: 0,
      wrong: 0,
      omitted: 0,
      sampleSize: 0,
    });
    expect(await attempts.countDocuments({ userId })).toBe(0);
  }, 60_000);
});
