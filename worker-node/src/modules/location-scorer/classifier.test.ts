import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUsLocationClassifier } from "./classifier.js";
import { loadLocationScorerConfig } from "./config.js";

const { pipelineMock } = vi.hoisted(() => ({
  pipelineMock: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
}));

describe("createUsLocationClassifier", () => {
  beforeEach(() => {
    pipelineMock.mockReset();
  });

  it("loads the quantized model variant by default", async () => {
    const run = vi.fn(async () => ({
      labels: ["Occurred in the United States", "Occurred outside the United States"],
      scores: [0.8, 0.2],
    }));
    pipelineMock.mockResolvedValue(run);

    const classifier = createUsLocationClassifier(
      loadLocationScorerConfig({}),
    );

    await classifier.load();
    await classifier.score("A story in Washington, D.C.");

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledWith(
      "zero-shot-classification",
      "Xenova/bart-large-mnli",
      { dtype: "q8" },
    );
    expect(run).toHaveBeenCalledWith("A story in Washington, D.C.", [
      "Occurred in the United States",
      "Occurred outside the United States",
    ]);
  });
});
