import { ObjectId } from "mongodb";

import {
  EXAM_DURATION_MS,
  EXAM_QUESTION_COUNT,
} from "@/lib/config";
import { collections } from "@/lib/db/collections";
import { ensureIndexes } from "@/lib/db/indexes";
import type { ExamPolicyDocument } from "@/types/domain";

const POLICY_SOURCE =
  "https://www.albonazionalegestoriambientali.it/Download/it/DelibereComitatoNazionale/146-Del6_26.11.2025.pdf";

const POLICIES: Array<Omit<ExamPolicyDocument, "_id">> = [
  {
    key: "2026-initial-general",
    examType: "initial",
    moduleKind: "general",
    questionCount: EXAM_QUESTION_COUNT,
    durationMs: EXAM_DURATION_MS,
    pointsCorrect: 1,
    pointsWrong: -0.5,
    pointsOmitted: 0,
    passThreshold: 32,
    active: true,
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    sourceUrl: POLICY_SOURCE,
  },
  {
    key: "2026-initial-specialist",
    examType: "initial",
    moduleKind: "specialist",
    questionCount: EXAM_QUESTION_COUNT,
    durationMs: EXAM_DURATION_MS,
    pointsCorrect: 1,
    pointsWrong: -0.5,
    pointsOmitted: 0,
    passThreshold: 34,
    active: true,
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    sourceUrl: POLICY_SOURCE,
  },
  {
    key: "2026-update-specialist",
    examType: "update",
    moduleKind: "specialist",
    questionCount: EXAM_QUESTION_COUNT,
    durationMs: EXAM_DURATION_MS,
    pointsCorrect: 1,
    pointsWrong: -0.5,
    pointsOmitted: 0,
    passThreshold: 28,
    active: true,
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    sourceUrl: POLICY_SOURCE,
  },
];

export async function bootstrapDatabase(): Promise<void> {
  await ensureIndexes();
  const { examPolicies } = await collections();
  await Promise.all(
    POLICIES.map((policy) =>
      examPolicies.updateOne(
        { key: policy.key },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            ...policy,
          },
        },
        { upsert: true },
      ),
    ),
  );
}
