import { pipeline } from "@huggingface/transformers";

import type { SemanticScoreCandidate, SemanticScorer } from "./types.js";

const SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2";
const DEFAULT_DTYPE = "fp32";

type FeatureExtractionPipeline = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<unknown>;

interface CachedKeywords {
  cacheKey: string;
  vectors: Array<{ keyword: string; vector: number[] }>;
}

export function createSemanticScorer(): SemanticScorer {
  let extractor: FeatureExtractionPipeline | undefined;
  let cachedKeywords: CachedKeywords | undefined;

  async function ensureLoaded() {
    if (!extractor) {
      extractor = (await pipeline("feature-extraction", SEMANTIC_MODEL, {
        dtype: DEFAULT_DTYPE,
      })) as unknown as FeatureExtractionPipeline;
    }

    return extractor;
  }

  async function embed(text: string) {
    const run = await ensureLoaded();
    const output = await run(text, { pooling: "mean", normalize: true });
    return toVector(output);
  }

  async function embedKeywords(keywords: string[]) {
    const cacheKey = keywords.join("\n");

    if (cachedKeywords?.cacheKey === cacheKey) {
      return cachedKeywords.vectors;
    }

    const vectors = await Promise.all(
      keywords.map(async (keyword) => ({
        keyword,
        vector: await embed(keyword),
      })),
    );

    cachedKeywords = { cacheKey, vectors };
    return vectors;
  }

  return {
    async load() {
      await ensureLoaded();
    },
    async score(text, keywords) {
      const articleVector = await embed(text);
      const keywordVectors = await embedKeywords(keywords);
      let best: SemanticScoreCandidate | null = null;

      for (const keywordVector of keywordVectors) {
        const score = cosineSimilarity(articleVector, keywordVector.vector);

        if (!best || score > best.score) {
          best = { score, label: keywordVector.keyword };
        }
      }

      if (!best || best.score < 0) {
        return null;
      }

      return best;
    },
  };
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  const magnitude = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);

  return magnitude === 0 ? 0 : dot / magnitude;
}

function toVector(output: unknown): number[] {
  if (Array.isArray(output)) {
    return flattenNumbers(output);
  }

  if (
    output &&
    typeof output === "object" &&
    "data" in output &&
    isIterableNumberData((output as { data?: unknown }).data)
  ) {
    return Array.from((output as { data: Iterable<number> }).data);
  }

  throw new Error("Semantic embedder returned an unsupported vector shape.");
}

function flattenNumbers(value: unknown): number[] {
  if (typeof value === "number") {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => flattenNumbers(item));
}

function isIterableNumberData(value: unknown): value is Iterable<number> {
  return !!value && typeof (value as Iterable<number>)[Symbol.iterator] === "function";
}
