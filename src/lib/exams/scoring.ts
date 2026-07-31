import type {
  AttemptQuestionSnapshot,
  AttemptResponse,
  AttemptSummary,
  ExamPolicyDocument,
  QuestionResult,
} from "@/types/domain";

export interface GradeResult {
  responses: AttemptResponse[];
  summary: AttemptSummary;
}

export function gradeAttempt(
  questions: AttemptQuestionSnapshot[],
  responses: AttemptResponse[],
  policy: ExamPolicyDocument,
  activeTimeMs: number,
  pausedTimeMs: number,
): GradeResult {
  if (questions.length !== responses.length) {
    throw new Error("Domande e risposte del tentativo non sono allineate.");
  }

  let correct = 0;
  let wrong = 0;
  let omitted = 0;
  let score = 0;

  const graded = responses.map((response, index) => {
    let result: QuestionResult;
    let points: number;
    if (response.skipped || !response.selectedOptionId) {
      result = "omitted";
      points = policy.pointsOmitted;
      omitted += 1;
    } else if (response.selectedOptionId === questions[index]?.correctOptionId) {
      result = "correct";
      points = policy.pointsCorrect;
      correct += 1;
    } else {
      result = "wrong";
      points = policy.pointsWrong;
      wrong += 1;
    }
    score += points;
    return { ...response, result, points };
  });

  const roundedScore = Math.round(score * 100) / 100;
  return {
    responses: graded,
    summary: {
      score: roundedScore,
      threshold: policy.passThreshold,
      passed: roundedScore >= policy.passThreshold,
      correct,
      wrong,
      omitted,
      activeTimeMs: Math.max(0, Math.round(activeTimeMs)),
      pausedTimeMs: Math.max(0, Math.round(pausedTimeMs)),
    },
  };
}
