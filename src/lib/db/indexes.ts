import { getDb } from "@/lib/db/client";

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  await Promise.all([
    db.collection("users").createIndexes([
      { key: { codeDigest: 1 }, name: "users_code_digest_unique", unique: true },
      { key: { role: 1, isActive: 1 }, name: "users_role_active" },
    ]),
    db.collection("sessions").createIndexes([
      { key: { tokenDigest: 1 }, name: "sessions_token_unique", unique: true },
      { key: { expiresAt: 1 }, name: "sessions_expiry_ttl", expireAfterSeconds: 0 },
      { key: { userId: 1, revokedAt: 1 }, name: "sessions_user_revoked" },
    ]),
    db.collection("loginEvents").createIndexes([
      { key: { codeDigest: 1, createdAt: -1 }, name: "login_code_time" },
      { key: { ipHash: 1, createdAt: -1 }, name: "login_ip_time" },
      { key: { userId: 1, createdAt: -1 }, name: "login_user_time" },
    ]),
    db.collection("auditEvents").createIndexes([
      { key: { actorUserId: 1, createdAt: -1 }, name: "audit_actor_time" },
      { key: { targetUserId: 1, createdAt: -1 }, name: "audit_target_time" },
    ]),
    db.collection("questionBanks").createIndexes([
      {
        key: { bankId: 1, version: 1 },
        name: "question_bank_version_unique",
        unique: true,
      },
      {
        key: { examType: 1, module: 1, status: 1 },
        name: "question_banks_one_active",
        unique: true,
        partialFilterExpression: { status: "active" },
      },
      {
        key: { examType: 1, module: 1, status: 1, activatedAt: -1 },
        name: "question_banks_active_lookup",
      },
    ]),
    db.collection("questions").createIndexes([
      {
        key: { bankId: 1, bankVersion: 1, ministryId: 1 },
        name: "question_bank_ministry_unique",
        unique: true,
      },
      {
        key: { bankId: 1, bankVersion: 1, contentHash: 1 },
        name: "questions_bank_content",
      },
      { key: { examType: 1, module: 1, bankVersion: -1 }, name: "questions_exam_lookup" },
    ]),
    db.collection("examPolicies").createIndexes([
      { key: { key: 1 }, name: "policies_key_unique", unique: true },
      {
        key: { examType: 1, moduleKind: 1, active: 1 },
        name: "policies_active_lookup",
      },
    ]),
    db.collection("attempts").createIndexes([
      {
        key: { userId: 1, openMarker: 1 },
        name: "attempts_one_open_per_user",
        unique: true,
        partialFilterExpression: { openMarker: true },
      },
      { key: { userId: 1, completedAt: -1 }, name: "attempts_user_history" },
      { key: { userId: 1, operationIds: 1 }, name: "attempts_idempotency_lookup" },
      { key: { status: 1, deadlineAt: 1 }, name: "attempts_expiry" },
      { key: { "questions.questionId": 1 }, name: "attempts_question_stats" },
    ]),
    db.collection("reviewEvents").createIndexes([
      { key: { userId: 1, createdAt: -1 }, name: "review_user_time" },
      { key: { userId: 1, questionId: 1, createdAt: -1 }, name: "review_user_question" },
    ]),
  ]);
}
