import { describe, expect, it } from "vitest";

import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  it("substitutes title and content placeholders", () => {
    expect(
      buildPrompt("title={articleTitle}\ncontent={articleContent}", {
        title: "Wildfire update",
        content: "Evacuations in California.",
      }),
    ).toBe("title=Wildfire update\ncontent=Evacuations in California.");
  });

  it("leaves templates without placeholders unchanged", () => {
    expect(
      buildPrompt("Classify this article.", {
        title: "Ignored",
        content: "Ignored too",
      }),
    ).toBe("Classify this article.");
  });

  it("supports empty title and content strings", () => {
    expect(
      buildPrompt("title={articleTitle};content={articleContent}", {
        title: "",
        content: "",
      }),
    ).toBe("title=;content=");
  });
});
