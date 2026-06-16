import { US_LABEL, type ZeroShotResult } from "./types.js";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Extract the score attached to the "Occurred in the United States" label (not
 * the first/winning label). Throws if the US label is absent — mirrors the
 * worker-python "US label missing from classifier result" failure path.
 */
export function extractUsScore(result: ZeroShotResult): number {
  const index = result.labels.indexOf(US_LABEL);

  if (index === -1) {
    throw new Error("US label missing from classifier result");
  }

  return clamp01(result.scores[index] ?? 0);
}
