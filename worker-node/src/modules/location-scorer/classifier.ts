import { pipeline } from "@huggingface/transformers";

import type { LocationScorerConfig } from "./config.js";
import { extractUsScore } from "./scorer.js";
import {
  LOCATION_LABELS,
  type LocationClassifier,
  type ZeroShotResult,
} from "./types.js";

type ZeroShotPipeline = (
  text: string,
  labels: string[],
) => Promise<ZeroShotResult | ZeroShotResult[]>;

/**
 * Lazily build the zero-shot classifier and reuse it across articles. The model
 * (Xenova/bart-large-mnli) is large, so it is only loaded when load()/score() is
 * first called.
 */
export function createUsLocationClassifier(
  config: LocationScorerConfig,
): LocationClassifier {
  let classifier: ZeroShotPipeline | undefined;

  async function ensureLoaded(): Promise<ZeroShotPipeline> {
    if (!classifier) {
      classifier = (await pipeline(
        "zero-shot-classification",
        config.model,
      )) as unknown as ZeroShotPipeline;
    }
    return classifier;
  }

  return {
    async load() {
      await ensureLoaded();
    },
    async score(text: string) {
      const run = await ensureLoaded();
      const output = await run(text, [...LOCATION_LABELS]);
      const result = Array.isArray(output) ? output[0] : output;
      if (!result) {
        throw new Error("Empty classifier result");
      }
      return extractUsScore(result);
    },
  };
}
