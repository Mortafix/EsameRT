import { describe, expect, it } from "vitest";

import { shuffle, uniqueQuestionSample } from "@/lib/exams/random";

describe("question randomization", () => {
  it("non muta l'array originale quando mescola", () => {
    const original = ["A", "B", "C", "D"];
    const result = shuffle(original);
    expect(original).toEqual(["A", "B", "C", "D"]);
    expect([...result].sort()).toEqual(original);
  });

  it("rimuove duplicati sia per ID ministeriale sia per contenuto", () => {
    const sample = uniqueQuestionSample(
      [
        { ministryId: "1", contentHash: "a" },
        { ministryId: "1", contentHash: "b" },
        { ministryId: "2", contentHash: "a" },
        { ministryId: "3", contentHash: "c" },
      ],
      40,
    );
    expect(sample).toHaveLength(2);
    expect(new Set(sample.map((item) => item.ministryId)).size).toBe(2);
    expect(new Set(sample.map((item) => item.contentHash)).size).toBe(2);
  });
});
