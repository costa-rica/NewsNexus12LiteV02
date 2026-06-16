import { describe, expect, it } from "vitest";

import { extractUsScore } from "./scorer.js";

describe("extractUsScore", () => {
  it("returns the US-label score, not the winning label", () => {
    const score = extractUsScore({
      labels: ["Occurred outside the United States", "Occurred in the United States"],
      scores: [0.7, 0.3],
    });

    expect(score).toBe(0.3);
  });

  it("throws when the US label is missing", () => {
    expect(() =>
      extractUsScore({ labels: ["Something else"], scores: [0.9] }),
    ).toThrow(/US label missing/);
  });

  it("clamps to the 0..1 range", () => {
    expect(
      extractUsScore({
        labels: ["Occurred in the United States"],
        scores: [1.5],
      }),
    ).toBe(1);
  });
});
