import type { Collection } from "mongodb";

import { getDb } from "@/lib/db/client";
import type {
  AttemptDocument,
  AuditEventDocument,
  ExamPolicyDocument,
  LoginEventDocument,
  QuestionBankDocument,
  QuestionDocument,
  ReviewEventDocument,
  SessionDocument,
  UserDocument,
} from "@/types/domain";

export async function collections(): Promise<{
  users: Collection<UserDocument>;
  sessions: Collection<SessionDocument>;
  loginEvents: Collection<LoginEventDocument>;
  auditEvents: Collection<AuditEventDocument>;
  questionBanks: Collection<QuestionBankDocument>;
  questions: Collection<QuestionDocument>;
  examPolicies: Collection<ExamPolicyDocument>;
  attempts: Collection<AttemptDocument>;
  reviewEvents: Collection<ReviewEventDocument>;
}> {
  const db = await getDb();
  return {
    users: db.collection<UserDocument>("users"),
    sessions: db.collection<SessionDocument>("sessions"),
    loginEvents: db.collection<LoginEventDocument>("loginEvents"),
    auditEvents: db.collection<AuditEventDocument>("auditEvents"),
    questionBanks: db.collection<QuestionBankDocument>("questionBanks"),
    questions: db.collection<QuestionDocument>("questions"),
    examPolicies: db.collection<ExamPolicyDocument>("examPolicies"),
    attempts: db.collection<AttemptDocument>("attempts"),
    reviewEvents: db.collection<ReviewEventDocument>("reviewEvents"),
  };
}
