import { describe, expect, it } from "vitest";

import { loadArticleContentConfig } from "./config.js";

describe("article-content-02 config", () => {
  it("uses documented defaults", () => {
    const config = loadArticleContentConfig({});

    expect(config).toMatchObject({
      articleTimeoutMs: 90_000,
      browserRecycleAttempts: 25,
      browserRecycleNavigationErrors: 3,
      googleNavigationTimeoutMs: 30_000,
      googlePostLoadWaitMs: 5_000,
      googleNavigationRetries: 2,
      publisherNavigationTimeoutMs: 20_000,
      publisherPostLoadWaitMs: 2_500,
      publisherFetchRetries: 2,
      contentMinLength: 200,
      paragraphMinLength: 20,
      incompleteHtmlLength: 500,
    });
  });

  it("floors the per-article timeout at 10000", () => {
    const config = loadArticleContentConfig({
      ARTICLE_CONTENT_02_ARTICLE_TIMEOUT_MS: "500",
    });

    expect(config.articleTimeoutMs).toBe(10_000);
  });
});
