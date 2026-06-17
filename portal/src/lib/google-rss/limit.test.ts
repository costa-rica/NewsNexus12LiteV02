import { afterEach, describe, expect, it, vi } from "vitest";

import { applyArticleLimit, resolveArticleLimit } from "./limit";

describe("article limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "0", "-1", "abc"])(
    "falls back to 10 for invalid value %s",
    (value) => {
      if (value !== undefined) {
        vi.stubEnv("ARTICLE_LIMIT_GOOGLE_RSS_SEARCH", value);
      }

      expect(resolveArticleLimit()).toBe(10);
    },
  );

  it("uses a valid positive integer", () => {
    vi.stubEnv("ARTICLE_LIMIT_GOOGLE_RSS_SEARCH", "3");

    expect(resolveArticleLimit()).toBe(3);
  });

  it("slices articles to the resolved limit", () => {
    expect(applyArticleLimit([1, 2, 3, 4], 2)).toEqual([1, 2]);
  });
});
