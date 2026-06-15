import { describe, expect, it } from "vitest";

import { getRatingCircleColor } from "./RatingCircle";

function greenChannel(rgb: string) {
  const match = rgb.match(/^rgb\(\d+, (\d+), \d+\)$/);
  return match ? Number(match[1]) : Number.NaN;
}

describe("RatingCircle color mapping", () => {
  it("maps higher normalized scores to greener colors", () => {
    const low = getRatingCircleColor(0.15);
    const high = getRatingCircleColor(0.9);

    expect(greenChannel(high)).toBeGreaterThan(greenChannel(low));
  });
});
