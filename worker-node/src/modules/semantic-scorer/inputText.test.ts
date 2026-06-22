import { describe, expect, it } from "vitest";

import { pickArticleText } from "./inputText.js";

describe("pickArticleText", () => {
  it("prefers successful scraped content", () => {
    expect(
      pickArticleText({
        id: "a1",
        title: "Fallback title",
        description: "Fallback description",
        scrape: { status: "success", content: "Scraped body" },
      }),
    ).toBe("Scraped body");
  });

  it("falls back to description, then title", () => {
    expect(
      pickArticleText({
        id: "a1",
        title: "Fallback title",
        description: "Description body",
        scrape: { status: "fail", content: "Ignored" },
      }),
    ).toBe("Description body");

    expect(pickArticleText({ id: "a2", title: "Title only" })).toBe(
      "Title only",
    );
  });

  it("returns an empty string when nothing is usable", () => {
    expect(pickArticleText({ id: "a1", title: " ", description: "" })).toBe("");
  });
});
