import { describe, expect, it } from "vitest";

import { defaultPrompt } from "./defaultPrompt";

describe("defaultPrompt", () => {
  it("retains the PRD state assignment prompt placeholders and schema text", () => {
    expect(defaultPrompt).toContain(
      "# Task: Determine U.S. Location and State from a News Article",
    );
    expect(defaultPrompt).toContain("{articleTitle}");
    expect(defaultPrompt).toContain("{articleContent}");
    expect(defaultPrompt).toContain('"occuredInTheUS": true');
    expect(defaultPrompt).toContain(
      '"state": "<full U.S. state name spelled out>"',
    );
  });
});
