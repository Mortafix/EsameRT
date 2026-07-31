import { randomInt } from "node:crypto";

export function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function uniqueQuestionSample<
  T extends { ministryId: string; contentHash: string },
>(questions: readonly T[], size: number): T[] {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const unique = questions.filter((question) => {
    if (
      seenIds.has(question.ministryId) ||
      seenContent.has(question.contentHash)
    ) {
      return false;
    }
    seenIds.add(question.ministryId);
    seenContent.add(question.contentHash);
    return true;
  });
  return shuffle(unique).slice(0, size);
}
