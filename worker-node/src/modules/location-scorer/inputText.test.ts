import { describe, expect, it } from "vitest";

import { buildClassifierInput } from "./inputText.js";

describe("buildClassifierInput", () => {
  it("prefers successful scraped content over description", () => {
    const input = buildClassifierInput({
      id: "a1",
      title: "Wildfire spreads",
      description: "Short desc",
      scrape: { status: "success", content: "Full scraped body" },
    });

    expect(input.eligible).toBe(true);
    expect(input.text).toBe("Wildfire spreads\n\nFull scraped body");
  });

  it("falls back to description when scrape failed or is missing", () => {
    const input = buildClassifierInput({
      id: "a1",
      title: "Wildfire spreads",
      description: "Short desc",
      scrape: { status: "fail" },
    });

    expect(input.text).toBe("Wildfire spreads\n\nShort desc");
  });

  it("falls back to RSS content when no scrape or description", () => {
    const input = buildClassifierInput({
      id: "a1",
      title: "Wildfire spreads",
      content: "RSS body",
    });

    expect(input.text).toBe("Wildfire spreads\n\nRSS body");
  });

  it("is eligible with a title only", () => {
    const input = buildClassifierInput({ id: "a1", title: "Title only" });
    expect(input.eligible).toBe(true);
    expect(input.text).toBe("Title only");
  });

  it("is ineligible when title and body are blank", () => {
    const input = buildClassifierInput({ id: "a1", title: "  ", description: "" });
    expect(input.eligible).toBe(false);
    expect(input.text).toBe("");
  });
});
