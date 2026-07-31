import type { ObjectId } from "mongodb";

export const EXAM_TYPES = ["initial", "update"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const MODULES = ["general", "cat145", "cat8", "cat9", "cat10"] as const;
export type Module = (typeof MODULES)[number];

export const ATTEMPT_STATUSES = [
  "active",
  "paused",
  "completed",
  "expired",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const QUESTION_RESULTS = ["correct", "wrong", "omitted"] as const;
export type QuestionResult = (typeof QUESTION_RESULTS)[number];

export type UserRole = "user" | "admin";

export interface UserDocument {
  _id: ObjectId;
  name: string;
  normalizedName: string;
  notes: string;
  role: UserRole;
  isActive: boolean;
  codeDigest: string;
  codeHash: string;
  codeCiphertext: string;
  codeHint: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface SessionDocument {
  _id: ObjectId;
  userId: ObjectId;
  tokenDigest: string;
  authenticatedAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ipHash?: string;
}

export interface LoginEventDocument {
  _id: ObjectId;
  userId?: ObjectId;
  codeDigest: string;
  ipHash: string;
  success: boolean;
  reason?: "invalid" | "disabled" | "rate_limited";
  createdAt: Date;
}

export interface AuditEventDocument {
  _id: ObjectId;
  actorUserId: ObjectId;
  action: string;
  targetUserId?: ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionBankDocument {
  _id: ObjectId;
  bankId: string;
  version: string;
  examType: ExamType;
  module: Module;
  status: "staged" | "active" | "archived";
  questionCount: number;
  sourceUrls: string[];
  sourceSha256: string;
  importedAt: Date;
  activatedAt?: Date;
}

export interface QuestionDocument {
  _id: ObjectId;
  bankId: string;
  bankVersion: string;
  examType: ExamType;
  module: Module;
  subject: string;
  subtopic?: string;
  ministryId: string;
  rawText: string;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
  revision: number;
  sourceUrl: string;
  sourceSha256: string;
  contentHash: string;
  createdAt: Date;
}

export interface ExamPolicyDocument {
  _id: ObjectId;
  key: string;
  examType: ExamType;
  moduleKind: "general" | "specialist";
  questionCount: number;
  durationMs: number;
  pointsCorrect: number;
  pointsWrong: number;
  pointsOmitted: number;
  passThreshold: number;
  active: boolean;
  effectiveFrom: Date;
  sourceUrl: string;
}

export interface AttemptQuestionSnapshot {
  questionId: ObjectId;
  ministryId: string;
  text: string;
  subject: string;
  subtopic?: string;
  contentHash: string;
  options: QuestionOption[];
  correctOptionId: string;
}

export interface AttemptResponse {
  questionIndex: number;
  selectedOptionId: string | null;
  visited: boolean;
  skipped?: boolean;
  answeredAt?: Date;
  timeSpentMs: number;
  result?: QuestionResult;
  points?: number;
}

export interface AttemptSummary {
  score: number;
  threshold: number;
  passed: boolean;
  correct: number;
  wrong: number;
  omitted: number;
  activeTimeMs: number;
  pausedTimeMs: number;
}

export interface AttemptDocument {
  _id: ObjectId;
  userId: ObjectId;
  examType: ExamType;
  module: Module;
  bankId: string;
  bankVersion: string;
  policyKey: string;
  status: AttemptStatus;
  openMarker?: true;
  revision: number;
  questions: AttemptQuestionSnapshot[];
  responses: AttemptResponse[];
  operationIds: string[];
  startedAt: Date;
  updatedAt: Date;
  activeStartedAt?: Date;
  deadlineAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  activeElapsedMs: number;
  pausedElapsedMs: number;
  summary?: AttemptSummary;
}

export interface ReviewEventDocument {
  _id: ObjectId;
  userId: ObjectId;
  questionId: ObjectId;
  ministryId: string;
  module: Module;
  selectedOptionId: string;
  correctOptionId: string;
  correct: boolean;
  reviewSessionId: string;
  createdAt: Date;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
  revision: number;
}

export interface ActiveAttemptQuestion {
  id: string;
  index: number;
  position: number;
  ministryId: string;
  ministerialId: string;
  text: string;
  subject: string;
  subtopic?: string;
  options: QuestionOption[];
  selectedOptionId: string | null;
  visited: boolean;
  skipped: boolean;
  response: Omit<AttemptResponse, "result" | "points">;
}

export interface ActiveAttemptPayload {
  id: string;
  examType: ExamType;
  module: Module;
  status: "active" | "paused";
  revision: number;
  startedAt: Date;
  threshold: number;
  remainingMs: number;
  remainingSeconds: number;
  activeElapsedMs: number;
  pausedElapsedMs: number;
  questions: ActiveAttemptQuestion[];
}

export interface CompletedAttemptQuestion extends ActiveAttemptQuestion {
  correctOptionId: string;
  result: QuestionResult;
  points: number;
}

export interface CompletedAttemptPayload {
  id: string;
  examType: ExamType;
  module: Module;
  status: "completed" | "expired";
  revision: number;
  startedAt: Date;
  completedAt: Date;
  summary: AttemptSummary;
  score: number;
  threshold: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  omittedCount: number;
  activeSeconds: number;
  pausedSeconds: number;
  questions: CompletedAttemptQuestion[];
}
