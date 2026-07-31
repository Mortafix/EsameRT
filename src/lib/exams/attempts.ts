import { ObjectId, type Filter } from "mongodb";

import { ApiError } from "@/lib/api";
import { collections } from "@/lib/db/collections";
import { loadPolicy } from "@/lib/exams/policy";
import { shuffle, uniqueQuestionSample } from "@/lib/exams/random";
import { gradeAttempt } from "@/lib/exams/scoring";
import {
  serializeActiveAttempt,
  serializeCompletedAttempt,
} from "@/lib/exams/serialize";
import {
  effectiveActiveMs,
  effectivePausedMs,
  hasExpired,
  remainingMs,
} from "@/lib/exams/timer";
import type {
  ActiveAttemptPayload,
  AttemptDocument,
  CompletedAttemptPayload,
  ExamType,
  Module,
  QuestionDocument,
} from "@/types/domain";

export type AttemptPayload = ActiveAttemptPayload | CompletedAttemptPayload;

function operationAlreadyApplied(
  attempt: AttemptDocument,
  operationId?: string,
): boolean {
  return !!operationId && attempt.operationIds.includes(operationId);
}

async function payload(
  attempt: AttemptDocument,
  now = new Date(),
): Promise<AttemptPayload> {
  const policy = await loadPolicy(attempt.examType, attempt.module);
  return attempt.status === "active" || attempt.status === "paused"
    ? serializeActiveAttempt(attempt, policy, now)
    : serializeCompletedAttempt(attempt);
}

async function selectBankQuestions(
  examType: ExamType,
  module: Module,
): Promise<{
  bankId: string;
  bankVersion: string;
  questions: QuestionDocument[];
}> {
  const { questionBanks, questions } = await collections();
  const bank = await questionBanks.findOne(
    { examType, module, status: "active" },
    { sort: { activatedAt: -1, importedAt: -1 } },
  );

  let bankId = bank?.bankId;
  let bankVersion = bank?.version;
  if (!bankId || !bankVersion) {
    const latestQuestion = await questions.findOne(
      { examType, module },
      { sort: { createdAt: -1 } },
    );
    bankId = latestQuestion?.bankId;
    bankVersion = latestQuestion?.bankVersion;
  }
  if (!bankId || !bankVersion) {
    throw new ApiError(
      409,
      "QUESTION_BANK_UNAVAILABLE",
      "La banca domande selezionata non è ancora disponibile.",
    );
  }

  const candidates = await questions.find({ bankId, bankVersion }).toArray();
  const validCandidates = candidates.filter(
    (question) =>
      question.options.length === 4 &&
      question.options.some((option) => option.id === question.correctOptionId),
  );
  return { bankId, bankVersion, questions: validCandidates };
}

export async function startAttempt(
  userId: ObjectId,
  examType: ExamType,
  module: Module,
  operationId?: string,
  now = new Date(),
): Promise<AttemptPayload> {
  const { attempts } = await collections();
  if (operationId) {
    const previous = await attempts.findOne({
      userId,
      operationIds: operationId,
    });
    if (previous) return payload(await refreshIfExpired(previous, now), now);
  }
  const open = await attempts.findOne({ userId, openMarker: true });
  if (open) {
    if (operationAlreadyApplied(open, operationId)) return payload(open, now);
    throw new ApiError(
      409,
      "OPEN_ATTEMPT_EXISTS",
      "Hai già un quiz aperto. Termina o elimina quello esistente.",
      { attemptId: open._id.toHexString(), status: open.status },
    );
  }

  const policy = await loadPolicy(examType, module);
  const bank = await selectBankQuestions(examType, module);
  const selected = uniqueQuestionSample(bank.questions, policy.questionCount);
  if (selected.length < policy.questionCount) {
    throw new ApiError(
      409,
      "INSUFFICIENT_QUESTIONS",
      `La banca contiene ${selected.length} domande uniche valide; ne servono ${policy.questionCount}.`,
    );
  }

  const attempt: AttemptDocument = {
    _id: new ObjectId(),
    userId,
    examType,
    module,
    bankId: bank.bankId,
    bankVersion: bank.bankVersion,
    policyKey: policy.key,
    status: "active",
    openMarker: true,
    revision: 1,
    questions: selected.map((question) => ({
      questionId: question._id,
      ministryId: question.ministryId,
      text: question.text,
      subject: question.subject,
      ...(question.subtopic ? { subtopic: question.subtopic } : {}),
      contentHash: question.contentHash,
      options: shuffle(question.options),
      correctOptionId: question.correctOptionId,
    })),
    responses: selected.map((_, questionIndex) => ({
      questionIndex,
      selectedOptionId: null,
      visited: false,
      skipped: false,
      timeSpentMs: 0,
    })),
    operationIds: operationId ? [operationId] : [],
    startedAt: now,
    updatedAt: now,
    activeStartedAt: now,
    deadlineAt: new Date(now.getTime() + policy.durationMs),
    activeElapsedMs: 0,
    pausedElapsedMs: 0,
  };

  try {
    await attempts.insertOne(attempt);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      const existing = await attempts.findOne({ userId, openMarker: true });
      throw new ApiError(
        409,
        "OPEN_ATTEMPT_EXISTS",
        "Hai già un quiz aperto.",
        existing ? { attemptId: existing._id.toHexString() } : undefined,
      );
    }
    throw error;
  }
  return serializeActiveAttempt(attempt, policy, now);
}

async function findOwnedAttempt(
  attemptId: ObjectId,
  userId: ObjectId,
): Promise<AttemptDocument> {
  const { attempts } = await collections();
  const attempt = await attempts.findOne({ _id: attemptId, userId });
  if (!attempt) {
    throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Quiz non trovato.");
  }
  return attempt;
}

async function finalize(
  attempt: AttemptDocument,
  mode: "completed" | "expired",
  now: Date,
  expectedRevision = attempt.revision,
  operationId?: string,
): Promise<AttemptDocument> {
  if (attempt.status === "completed" || attempt.status === "expired") return attempt;
  const { attempts } = await collections();
  const policy = await loadPolicy(attempt.examType, attempt.module);
  const activeTime =
    mode === "expired"
      ? policy.durationMs
      : Math.min(policy.durationMs, effectiveActiveMs(attempt, now));
  const pausedTime = effectivePausedMs(attempt, now);
  const graded = gradeAttempt(
    attempt.questions,
    attempt.responses,
    policy,
    activeTime,
    pausedTime,
  );
  const completedAt =
    mode === "expired" && attempt.deadlineAt ? attempt.deadlineAt : now;
  const operationIds =
    operationId && !attempt.operationIds.includes(operationId)
      ? [...attempt.operationIds, operationId]
      : attempt.operationIds;

  const result = await attempts.findOneAndUpdate(
    {
      _id: attempt._id,
      userId: attempt.userId,
      revision: expectedRevision,
      openMarker: true,
    },
    {
      $set: {
        status: mode,
        revision: expectedRevision + 1,
        responses: graded.responses,
        summary: graded.summary,
        operationIds,
        activeElapsedMs: activeTime,
        pausedElapsedMs: pausedTime,
        completedAt,
        updatedAt: now,
      },
      $unset: {
        openMarker: "",
        activeStartedAt: "",
        deadlineAt: "",
        pausedAt: "",
      },
    },
    { returnDocument: "after" },
  );
  if (result) return result;

  const current = await attempts.findOne({ _id: attempt._id, userId: attempt.userId });
  if (!current) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Quiz non trovato.");
  if (current.status === "completed" || current.status === "expired") return current;
  throw new ApiError(409, "REVISION_CONFLICT", "Il quiz è stato modificato altrove.", {
    currentRevision: current.revision,
  });
}

async function refreshIfExpired(
  attempt: AttemptDocument,
  now = new Date(),
): Promise<AttemptDocument> {
  if (attempt.status !== "active") return attempt;
  const policy = await loadPolicy(attempt.examType, attempt.module);
  if (!hasExpired(attempt, policy.durationMs, now)) return attempt;
  return finalize(attempt, "expired", now);
}

export async function getAttempt(
  attemptId: ObjectId,
  userId: ObjectId,
  now = new Date(),
): Promise<AttemptPayload> {
  const attempt = await refreshIfExpired(
    await findOwnedAttempt(attemptId, userId),
    now,
  );
  return payload(attempt, now);
}

export async function getOpenAttempt(
  userId: ObjectId,
  now = new Date(),
): Promise<AttemptPayload | null> {
  const { attempts } = await collections();
  const attempt = await attempts.findOne({ userId, openMarker: true });
  if (!attempt) return null;
  const fresh = await refreshIfExpired(attempt, now);
  return payload(fresh, now);
}

function assertRevision(attempt: AttemptDocument, revision: number): void {
  if (attempt.revision !== revision) {
    throw new ApiError(409, "REVISION_CONFLICT", "Il quiz è stato modificato altrove.", {
      currentRevision: attempt.revision,
    });
  }
}

export async function saveAnswer(
  attemptId: ObjectId,
  userId: ObjectId,
  input: {
    revision: number;
    questionIndex?: number;
    questionId?: ObjectId;
    selectedOptionId: string | null;
    skipped?: boolean;
    timeSpentMs?: number;
  },
  operationId?: string,
  now = new Date(),
): Promise<AttemptPayload> {
  const { attempts } = await collections();
  let attempt = await refreshIfExpired(
    await findOwnedAttempt(attemptId, userId),
    now,
  );
  if (operationAlreadyApplied(attempt, operationId)) return payload(attempt, now);
  if (attempt.status !== "active") {
    throw new ApiError(
      409,
      "ATTEMPT_NOT_ACTIVE",
      attempt.status === "paused"
        ? "Riprendi il quiz prima di modificare una risposta."
        : "Il quiz è già concluso.",
    );
  }
  assertRevision(attempt, input.revision);

  const questionIndex =
    input.questionIndex ??
    (input.questionId
      ? attempt.questions.findIndex((question) =>
          question.questionId.equals(input.questionId!),
        )
      : -1);
  const question = attempt.questions[questionIndex];
  const response = attempt.responses[questionIndex];
  if (!question || !response) {
    throw new ApiError(400, "INVALID_QUESTION", "Numero di domanda non valido.");
  }
  if (
    input.selectedOptionId !== null &&
    !question.options.some((option) => option.id === input.selectedOptionId)
  ) {
    throw new ApiError(400, "INVALID_OPTION", "Risposta selezionata non valida.");
  }

  const timeDelta = Math.max(
    0,
    Math.min(600_000, Math.round(input.timeSpentMs ?? 0)),
  );
  const responses = [...attempt.responses];
  responses[questionIndex] = {
    questionIndex,
    selectedOptionId: input.selectedOptionId,
    visited: true,
    skipped: input.skipped ?? false,
    answeredAt: now,
    timeSpentMs: Math.min(3_600_000, response.timeSpentMs + timeDelta),
  };
  const operationIds = operationId
    ? [...attempt.operationIds, operationId]
    : attempt.operationIds;

  const updated = await attempts.findOneAndUpdate(
    {
      _id: attempt._id,
      userId,
      revision: input.revision,
      status: "active",
      deadlineAt: { $gt: now },
    },
    {
      $set: {
        responses,
        operationIds,
        updatedAt: now,
        revision: input.revision + 1,
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    attempt = await refreshIfExpired(await findOwnedAttempt(attemptId, userId), now);
    if (attempt.status === "expired") return payload(attempt, now);
    assertRevision(attempt, input.revision);
    throw new ApiError(409, "ATTEMPT_STATE_CONFLICT", "Stato del quiz non valido.");
  }
  return payload(updated, now);
}

export async function pauseAttempt(
  attemptId: ObjectId,
  userId: ObjectId,
  revision: number,
  operationId?: string,
  now = new Date(),
): Promise<AttemptPayload> {
  const { attempts } = await collections();
  let attempt = await refreshIfExpired(
    await findOwnedAttempt(attemptId, userId),
    now,
  );
  if (operationAlreadyApplied(attempt, operationId)) return payload(attempt, now);
  if (attempt.status === "paused") return payload(attempt, now);
  if (attempt.status !== "active") return payload(attempt, now);
  assertRevision(attempt, revision);
  const activeElapsedMs = effectiveActiveMs(attempt, now);
  const updated = await attempts.findOneAndUpdate(
    {
      _id: attemptId,
      userId,
      revision,
      status: "active",
      deadlineAt: { $gt: now },
    },
    {
      $set: {
        status: "paused",
        revision: revision + 1,
        activeElapsedMs,
        pausedAt: now,
        updatedAt: now,
        operationIds: operationId
          ? [...attempt.operationIds, operationId]
          : attempt.operationIds,
      },
      $unset: { activeStartedAt: "", deadlineAt: "" },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    attempt = await refreshIfExpired(await findOwnedAttempt(attemptId, userId), now);
    if (attempt.status === "expired") return payload(attempt, now);
    throw new ApiError(409, "REVISION_CONFLICT", "Il quiz è stato modificato altrove.", {
      currentRevision: attempt.revision,
    });
  }
  return payload(updated, now);
}

export async function resumeAttempt(
  attemptId: ObjectId,
  userId: ObjectId,
  revision: number,
  operationId?: string,
  now = new Date(),
): Promise<AttemptPayload> {
  const { attempts } = await collections();
  const attempt = await findOwnedAttempt(attemptId, userId);
  if (operationAlreadyApplied(attempt, operationId)) return payload(attempt, now);
  if (attempt.status === "active") return payload(attempt, now);
  if (attempt.status !== "paused") return payload(attempt, now);
  assertRevision(attempt, revision);
  const policy = await loadPolicy(attempt.examType, attempt.module);
  const remaining = remainingMs(attempt, policy.durationMs, now);
  const pausedElapsedMs = effectivePausedMs(attempt, now);
  const updated = await attempts.findOneAndUpdate(
    { _id: attemptId, userId, revision, status: "paused" },
    {
      $set: {
        status: "active",
        revision: revision + 1,
        activeStartedAt: now,
        deadlineAt: new Date(now.getTime() + remaining),
        pausedElapsedMs,
        updatedAt: now,
        operationIds: operationId
          ? [...attempt.operationIds, operationId]
          : attempt.operationIds,
      },
      $unset: { pausedAt: "" },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    const current = await findOwnedAttempt(attemptId, userId);
    throw new ApiError(409, "REVISION_CONFLICT", "Il quiz è stato modificato altrove.", {
      currentRevision: current.revision,
    });
  }
  return payload(updated, now);
}

export async function completeAttempt(
  attemptId: ObjectId,
  userId: ObjectId,
  revision: number,
  confirmed: boolean,
  operationId?: string,
  now = new Date(),
): Promise<AttemptPayload> {
  let attempt = await refreshIfExpired(
    await findOwnedAttempt(attemptId, userId),
    now,
  );
  if (operationAlreadyApplied(attempt, operationId)) return payload(attempt, now);
  if (attempt.status === "completed" || attempt.status === "expired") {
    return payload(attempt, now);
  }
  assertRevision(attempt, revision);
  if (!confirmed) {
    throw new ApiError(
      409,
      "COMPLETION_CONFIRMATION_REQUIRED",
      "Conferma la conclusione anticipata del quiz.",
      {
        omitted: attempt.responses.filter((response) => !response.selectedOptionId)
          .length,
      },
    );
  }
  attempt = await finalize(attempt, "completed", now, revision, operationId);
  return serializeCompletedAttempt(attempt);
}

export async function expireDueAttempts(now = new Date()): Promise<number> {
  const { attempts } = await collections();
  const due = await attempts
    .find({ status: "active", openMarker: true, deadlineAt: { $lte: now } })
    .toArray();
  const results = await Promise.allSettled(
    due.map((attempt) => finalize(attempt, "expired", now)),
  );
  return results.filter((result) => result.status === "fulfilled").length;
}

export async function deleteAttempt(
  attemptId: ObjectId,
  userId: ObjectId,
): Promise<void> {
  const { attempts } = await collections();
  await attempts.deleteOne({ _id: attemptId, userId });
}

export async function listHistory(
  userId: ObjectId,
  filter: {
    module?: Module;
    examType?: ExamType;
    passed?: boolean;
    limit: number;
    before?: Date;
  },
): Promise<{
  attempts: Array<{
    id: string;
    module: Module;
    examType: ExamType;
    status: "completed" | "expired";
    startedAt: Date;
    completedAt: Date;
    summary: NonNullable<AttemptDocument["summary"]>;
  }>;
  nextBefore?: Date;
}> {
  const { attempts } = await collections();
  const query: Filter<AttemptDocument> = {
    userId,
    status: { $in: ["completed", "expired"] },
    completedAt: { $exists: true, ...(filter.before ? { $lt: filter.before } : {}) },
    summary: { $exists: true },
    ...(filter.module ? { module: filter.module } : {}),
    ...(filter.examType ? { examType: filter.examType } : {}),
    ...(filter.passed === undefined ? {} : { "summary.passed": filter.passed }),
  };
  const found = await attempts
    .find(query)
    .sort({ completedAt: -1 })
    .limit(filter.limit + 1)
    .toArray();
  const hasMore = found.length > filter.limit;
  const page = found.slice(0, filter.limit);
  return {
    attempts: page.map((attempt) => ({
      id: attempt._id.toHexString(),
      module: attempt.module,
      examType: attempt.examType,
      status: attempt.status as "completed" | "expired",
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt!,
      summary: attempt.summary!,
    })),
    ...(hasMore && page.at(-1)?.completedAt
      ? { nextBefore: page.at(-1)!.completedAt }
      : {}),
  };
}
