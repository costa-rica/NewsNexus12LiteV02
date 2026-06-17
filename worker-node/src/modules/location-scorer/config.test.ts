import { describe, expect, it } from "vitest";

import { loadLocationScorerConfig } from "./config.js";

describe("loadLocationScorerConfig", () => {
  it("defaults to the quantized BART MNLI model", () => {
    expect(loadLocationScorerConfig({})).toEqual({
      model: "Xenova/bart-large-mnli",
      dtype: "q8",
    });
  });

  it("allows overriding the model and dtype", () => {
    expect(
      loadLocationScorerConfig({
        LOCATION_SCORER_MODEL: "Xenova/mobilebert-uncased-mnli",
        LOCATION_SCORER_DTYPE: "fp32",
      }),
    ).toEqual({
      model: "Xenova/mobilebert-uncased-mnli",
      dtype: "fp32",
    });
  });

  it("falls back to q8 when dtype is invalid", () => {
    expect(
      loadLocationScorerConfig({ LOCATION_SCORER_DTYPE: "invalid" }),
    ).toMatchObject({ dtype: "q8" });
  });
});
