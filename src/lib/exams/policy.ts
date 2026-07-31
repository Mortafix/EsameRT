import { ObjectId } from "mongodb";

import { ApiError } from "@/lib/api";
import { EXAM_DURATION_MS, EXAM_QUESTION_COUNT } from "@/lib/config";
import { bootstrapDatabase } from "@/lib/db/bootstrap";
import { collections } from "@/lib/db/collections";
import type {
  ExamPolicyDocument,
  ExamType,
  Module,
} from "@/types/domain";

export function assertExamSelection(examType: ExamType, module: Module): void {
  if (examType === "update" && module === "general") {
    throw new ApiError(
      400,
      "INVALID_EXAM_SELECTION",
      "Il modulo generale non è previsto per la verifica di aggiornamento.",
    );
  }
}

export function policyKey(examType: ExamType, module: Module): string {
  const kind = module === "general" ? "general" : "specialist";
  return `2026-${examType}-${kind}`;
}

export function defaultPolicy(
  examType: ExamType,
  module: Module,
): ExamPolicyDocument {
  assertExamSelection(examType, module);
  const key = policyKey(examType, module);
  const threshold =
    examType === "update" ? 28 : module === "general" ? 32 : 34;
  return {
    _id: new ObjectId(),
    key,
    examType,
    moduleKind: module === "general" ? "general" : "specialist",
    questionCount: EXAM_QUESTION_COUNT,
    durationMs: EXAM_DURATION_MS,
    pointsCorrect: 1,
    pointsWrong: -0.5,
    pointsOmitted: 0,
    passThreshold: threshold,
    active: true,
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    sourceUrl:
      "https://www.albonazionalegestoriambientali.it/Download/it/DelibereComitatoNazionale/146-Del6_26.11.2025.pdf",
  };
}

export async function loadPolicy(
  examType: ExamType,
  module: Module,
): Promise<ExamPolicyDocument> {
  assertExamSelection(examType, module);
  const { examPolicies } = await collections();
  const key = policyKey(examType, module);
  let policy = await examPolicies.findOne({ key, active: true });
  if (!policy) {
    await bootstrapDatabase();
    policy = await examPolicies.findOne({ key, active: true });
  }
  return policy ?? defaultPolicy(examType, module);
}
