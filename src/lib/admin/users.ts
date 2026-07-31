import { ObjectId } from "mongodb";

import { ApiError } from "@/lib/api";
import {
  codeHint,
  decryptCode,
  digestCode,
  encryptCode,
  hashCode,
  validateCode,
  verifyCodeHash,
} from "@/lib/auth/codes";
import type { AuthContext } from "@/lib/auth/sessions";
import { collections } from "@/lib/db/collections";
import type { UserDocument, UserRole } from "@/types/domain";

function normalizeName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

function publicUser(user: UserDocument) {
  return {
    id: user._id.toHexString(),
    name: user.name,
    notes: user.notes,
    role: user.role,
    isActive: user.isActive,
    codeHint: user.codeHint,
    revision: user.revision,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

function codeValidationError(error: unknown): never {
  throw new ApiError(
    400,
    "INVALID_CODE",
    error instanceof Error ? error.message : "Codice non valido.",
  );
}

async function assertNotLastAdmin(
  target: UserDocument,
  next: { role?: UserRole; isActive?: boolean },
): Promise<void> {
  const remainsActiveAdmin =
    (next.role ?? target.role) === "admin" &&
    (next.isActive ?? target.isActive) === true;
  if (target.role !== "admin" || !target.isActive || remainsActiveAdmin) return;
  const { users } = await collections();
  const otherAdmins = await users.countDocuments({
    _id: { $ne: target._id },
    role: "admin",
    isActive: true,
  });
  if (!otherAdmins) {
    throw new ApiError(
      409,
      "LAST_ADMIN",
      "Non puoi disattivare, declassare o eliminare l’ultimo amministratore.",
    );
  }
}

export async function createUser(
  actorUserId: ObjectId,
  input: { name: string; code: string; role: UserRole; notes?: string },
) {
  const { users, auditEvents } = await collections();
  const name = normalizeName(input.name);
  if (name.length < 2 || name.length > 100) {
    throw new ApiError(400, "INVALID_NAME", "Il nome deve avere 2–100 caratteri.");
  }

  let normalizedCode: string;
  try {
    normalizedCode = validateCode(input.code);
  } catch (error) {
    codeValidationError(error);
  }
  const displayCode = input.code.normalize("NFKC").trim();
  const now = new Date();
  const [codeHash, codeCiphertext] = await Promise.all([
    hashCode(normalizedCode),
    Promise.resolve(encryptCode(displayCode)),
  ]);
  const user: UserDocument = {
    _id: new ObjectId(),
    name,
    normalizedName: name.toLocaleLowerCase("it-IT"),
    notes: input.notes?.trim().slice(0, 2_000) ?? "",
    role: input.role,
    isActive: true,
    codeDigest: digestCode(normalizedCode),
    codeHash,
    codeCiphertext,
    codeHint: codeHint(displayCode),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insertOne(user);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new ApiError(409, "CODE_ALREADY_USED", "Questo codice è già in uso.");
    }
    throw error;
  }
  await auditEvents.insertOne({
    _id: new ObjectId(),
    actorUserId,
    action: "user.created",
    targetUserId: user._id,
    metadata: { role: user.role },
    createdAt: now,
  });
  return publicUser(user);
}

export async function listUsersWithStats() {
  const { users, loginEvents, attempts, sessions } = await collections();
  const [allUsers, loginRows, attemptRows, sessionRows] = await Promise.all([
    users.find({}).sort({ normalizedName: 1 }).toArray(),
    loginEvents
      .aggregate<{
        _id: ObjectId;
        loginCount: number;
        lastLoginAt: Date;
      }>([
        { $match: { success: true, userId: { $exists: true } } },
        {
          $group: {
            _id: "$userId",
            loginCount: { $sum: 1 },
            lastLoginAt: { $max: "$createdAt" },
          },
        },
      ])
      .toArray(),
    attempts
      .aggregate<{
        _id: ObjectId;
        quizCount: number;
        completedQuizCount: number;
        averageScore: number | null;
        bestScore: number | null;
        passed: number;
        totalActiveMs: number;
        lastAttemptAt: Date;
      }>([
        {
          $group: {
            _id: "$userId",
            quizCount: { $sum: 1 },
            completedQuizCount: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["completed", "expired"]] },
                  1,
                  0,
                ],
              },
            },
            averageScore: {
              $avg: {
                $cond: [
                  { $in: ["$status", ["completed", "expired"]] },
                  "$summary.score",
                  null,
                ],
              },
            },
            bestScore: {
              $max: {
                $cond: [
                  { $in: ["$status", ["completed", "expired"]] },
                  "$summary.score",
                  null,
                ],
              },
            },
            passed: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", ["completed", "expired"]] },
                      "$summary.passed",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalActiveMs: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["completed", "expired"]] },
                  "$summary.activeTimeMs",
                  0,
                ],
              },
            },
            lastAttemptAt: { $max: "$updatedAt" },
          },
        },
      ])
      .toArray(),
    sessions
      .aggregate<{ _id: ObjectId; activeSessions: number }>([
        {
          $match: {
            revokedAt: { $exists: false },
            expiresAt: { $gt: new Date() },
          },
        },
        { $group: { _id: "$userId", activeSessions: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const logins = new Map(loginRows.map((row) => [row._id.toHexString(), row]));
  const quizzes = new Map(attemptRows.map((row) => [row._id.toHexString(), row]));
  const activeSessions = new Map(
    sessionRows.map((row) => [row._id.toHexString(), row.activeSessions]),
  );
  return {
    users: allUsers.map((user) => {
      const id = user._id.toHexString();
      const login = logins.get(id);
      const quiz = quizzes.get(id);
      const lastActivityAt =
        login?.lastLoginAt && quiz?.lastAttemptAt
          ? login.lastLoginAt > quiz.lastAttemptAt
            ? login.lastLoginAt
            : quiz.lastAttemptAt
          : (login?.lastLoginAt ?? quiz?.lastAttemptAt ?? null);
      return {
        ...publicUser(user),
        lastLoginAt: login?.lastLoginAt ?? user.lastLoginAt ?? null,
        lastActivityAt,
        loginCount: login?.loginCount ?? 0,
        quizCount: quiz?.quizCount ?? 0,
        averageScore:
          quiz?.averageScore == null
            ? null
            : Math.round(quiz.averageScore * 100) / 100,
        bestScore: quiz?.bestScore ?? null,
        passRate: quiz?.completedQuizCount
          ? Math.round((quiz.passed / quiz.completedQuizCount) * 10_000) / 100
          : 0,
        totalActiveMs: quiz?.totalActiveMs ?? 0,
        activeSessions: activeSessions.get(id) ?? 0,
      };
    }),
  };
}

export async function updateUser(
  actorUserId: ObjectId,
  targetId: ObjectId,
  revision: number,
  patch: {
    name?: string;
    notes?: string;
    role?: UserRole;
    isActive?: boolean;
  },
) {
  const { users, sessions, auditEvents } = await collections();
  const target = await users.findOne({ _id: targetId });
  if (!target) throw new ApiError(404, "USER_NOT_FOUND", "Utente non trovato.");
  if (target.revision !== revision) {
    throw new ApiError(409, "REVISION_CONFLICT", "L’utente è stato modificato altrove.", {
      currentRevision: target.revision,
    });
  }
  await assertNotLastAdmin(target, patch);
  const name = patch.name === undefined ? undefined : normalizeName(patch.name);
  if (name !== undefined && (name.length < 2 || name.length > 100)) {
    throw new ApiError(400, "INVALID_NAME", "Il nome deve avere 2–100 caratteri.");
  }
  const now = new Date();
  const updated = await users.findOneAndUpdate(
    { _id: targetId, revision },
    {
      $set: {
        ...(name === undefined
          ? {}
          : {
              name,
              normalizedName: name.toLocaleLowerCase("it-IT"),
            }),
        ...(patch.notes === undefined
          ? {}
          : { notes: patch.notes.trim().slice(0, 2_000) }),
        ...(patch.role === undefined ? {} : { role: patch.role }),
        ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
        updatedAt: now,
        revision: revision + 1,
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw new ApiError(409, "REVISION_CONFLICT", "L’utente è stato modificato altrove.");
  }
  if (patch.isActive === false || patch.role !== undefined) {
    await sessions.updateMany(
      { userId: targetId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now } },
    );
  }
  await auditEvents.insertOne({
    _id: new ObjectId(),
    actorUserId,
    action: "user.updated",
    targetUserId: targetId,
    metadata: {
      fields: Object.keys(patch),
      sessionsRevoked: patch.isActive === false || patch.role !== undefined,
    },
    createdAt: now,
  });
  return publicUser(updated);
}

export async function changeUserCode(
  actorUserId: ObjectId,
  targetId: ObjectId,
  revision: number,
  code: string,
) {
  const { users, sessions, auditEvents } = await collections();
  const target = await users.findOne({ _id: targetId });
  if (!target) throw new ApiError(404, "USER_NOT_FOUND", "Utente non trovato.");
  if (target.revision !== revision) {
    throw new ApiError(409, "REVISION_CONFLICT", "L’utente è stato modificato altrove.", {
      currentRevision: target.revision,
    });
  }
  let normalized: string;
  try {
    normalized = validateCode(code);
  } catch (error) {
    codeValidationError(error);
  }
  const displayCode = code.normalize("NFKC").trim();
  const [codeHashValue, codeCiphertext] = await Promise.all([
    hashCode(normalized),
    Promise.resolve(encryptCode(displayCode)),
  ]);
  const now = new Date();
  let updated: UserDocument | null;
  try {
    updated = await users.findOneAndUpdate(
      { _id: targetId, revision },
      {
        $set: {
          codeDigest: digestCode(normalized),
          codeHash: codeHashValue,
          codeCiphertext,
          codeHint: codeHint(displayCode),
          revision: revision + 1,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new ApiError(409, "CODE_ALREADY_USED", "Questo codice è già in uso.");
    }
    throw error;
  }
  if (!updated) throw new ApiError(409, "REVISION_CONFLICT", "Utente modificato altrove.");
  await sessions.updateMany(
    { userId: targetId, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } },
  );
  await auditEvents.insertOne({
    _id: new ObjectId(),
    actorUserId,
    action: "user.code_changed",
    targetUserId: targetId,
    metadata: { sessionsRevoked: true },
    createdAt: now,
  });
  return publicUser(updated);
}

export async function revealUserCode(
  context: AuthContext,
  targetId: ObjectId,
  adminCode: string,
) {
  const { users, sessions, auditEvents } = await collections();
  let normalized: string;
  try {
    normalized = validateCode(adminCode);
  } catch {
    throw new ApiError(401, "REAUTH_FAILED", "Codice amministratore non valido.");
  }
  const verified = await verifyCodeHash(context.userDocument.codeHash, normalized);
  if (!verified) {
    throw new ApiError(401, "REAUTH_FAILED", "Codice amministratore non valido.");
  }
  const target = await users.findOne({ _id: targetId });
  if (!target) throw new ApiError(404, "USER_NOT_FOUND", "Utente non trovato.");
  const now = new Date();
  await Promise.all([
    sessions.updateOne(
      { _id: context.session._id },
      { $set: { authenticatedAt: now } },
    ),
    auditEvents.insertOne({
      _id: new ObjectId(),
      actorUserId: context.userDocument._id,
      action: "user.code_revealed",
      targetUserId: targetId,
      metadata: { reason: "admin_panel" },
      createdAt: now,
    }),
  ]);
  return { id: target._id.toHexString(), code: decryptCode(target.codeCiphertext) };
}

export async function revokeUserSessions(
  actorUserId: ObjectId,
  targetId: ObjectId,
) {
  const { users, sessions, auditEvents } = await collections();
  if (!(await users.findOne({ _id: targetId }, { projection: { _id: 1 } }))) {
    throw new ApiError(404, "USER_NOT_FOUND", "Utente non trovato.");
  }
  const now = new Date();
  const result = await sessions.updateMany(
    { userId: targetId, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } },
  );
  await auditEvents.insertOne({
    _id: new ObjectId(),
    actorUserId,
    action: "user.sessions_revoked",
    targetUserId: targetId,
    metadata: { count: result.modifiedCount },
    createdAt: now,
  });
  return { revoked: result.modifiedCount };
}

export async function deleteUser(
  actorUserId: ObjectId,
  targetId: ObjectId,
  revision: number,
  confirmation: string,
) {
  const {
    users,
    sessions,
    loginEvents,
    attempts,
    reviewEvents,
    auditEvents,
  } = await collections();
  const target = await users.findOne({ _id: targetId });
  if (!target) throw new ApiError(404, "USER_NOT_FOUND", "Utente non trovato.");
  if (target.revision !== revision) {
    throw new ApiError(409, "REVISION_CONFLICT", "L’utente è stato modificato altrove.", {
      currentRevision: target.revision,
    });
  }
  if (normalizeName(confirmation) !== target.name) {
    throw new ApiError(
      400,
      "CONFIRMATION_MISMATCH",
      "La conferma non corrisponde al nome dell’utente.",
    );
  }
  if (target._id.equals(actorUserId)) {
    throw new ApiError(
      409,
      "CANNOT_DELETE_SELF",
      "Non puoi eliminare il tuo account dalla sessione corrente.",
    );
  }
  await assertNotLastAdmin(target, { isActive: false });
  const now = new Date();
  const locked = await users.updateOne(
    { _id: targetId, revision },
    {
      $set: {
        isActive: false,
        revision: revision + 1,
        updatedAt: now,
      },
    },
  );
  if (!locked.modifiedCount) {
    throw new ApiError(409, "REVISION_CONFLICT", "L’utente è stato modificato altrove.");
  }
  await Promise.all([
    sessions.deleteMany({ userId: targetId }),
    loginEvents.deleteMany({ userId: targetId }),
    attempts.deleteMany({ userId: targetId }),
    reviewEvents.deleteMany({ userId: targetId }),
  ]);
  await users.deleteOne({ _id: targetId, revision: revision + 1 });
  await auditEvents.insertOne({
    _id: new ObjectId(),
    actorUserId,
    action: "user.deleted",
    targetUserId: targetId,
    metadata: { role: target.role },
    createdAt: now,
  });
  return { deleted: true };
}
