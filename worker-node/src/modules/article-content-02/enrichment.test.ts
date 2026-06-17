import { describe, expect, it } from "vitest";

import {
  createEmptyScrapeSummary,
  enrichArticle,
  summarizeScrapeResults,
} from "./enrichment.js";
import type { PublisherFetchResult } from "./publisherFetcher.js";

const enoughContent = "This is a full article paragraph with enough useful content. ".repeat(8);

describe("enrichArticle", () => {
  it("uses the RSS shortcut when feed content is long enough", async () => {
    const result = await enrichArticle(
      {
        id: "a1",
        title: "Feed article",
        link: "https://news.google.com/rss/articles/a1",
        content: enoughContent,
      },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      articleId: "a1",
      status: "success",
      bodySource: "rss-feed",
      extractionSource: "none",
      content: enoughContent.trim(),
    });
  });

  it("fails gracefully when an article has no URL", async () => {
    const result = await enrichArticle({ id: "a1" }, new AbortController().signal);

    expect(result).toMatchObject({
      status: "fail",
      failureType: "no_publisher_url_found",
      bodySource: "none",
      extractionSource: "none",
    });
  });

  it("returns blocked_google when Google classification blocks the page", async () => {
    const result = await enrichArticle(
      { id: "a1", link: "https://news.google.com/rss/articles/a1" },
      new AbortController().signal,
      {
        navigateGoogle: async () => ({
          status: "success",
          finalUrl: "https://consent.google.com/",
          html: "<html>Before you continue</html>",
          statusCode: 200,
        }),
      },
    );

    expect(result).toMatchObject({
      status: "fail",
      failureType: "blocked_google",
      googleStatusCode: 200,
    });
  });

  it("returns no_publisher_url_found when Google has no usable publisher URL", async () => {
    const result = await enrichArticle(
      { id: "a1", link: "https://news.google.com/rss/articles/a1" },
      new AbortController().signal,
      {
        navigateGoogle: async () => ({
          status: "success",
          finalUrl: "https://news.google.com/articles/a1",
          html: "<html><body>No usable links here</body></html>",
        }),
      },
    );

    expect(result).toMatchObject({
      status: "fail",
      failureType: "no_publisher_url_found",
      bodySource: "google-page",
    });
  });

  it("returns blocked_publisher when publisher fetching is blocked", async () => {
    const result = await enrichArticle(
      { id: "a1", link: "https://news.google.com/rss/articles/a1" },
      new AbortController().signal,
      {
        navigateGoogle: async () => googleWithCanonical(),
        fetchPublisher: async (): Promise<PublisherFetchResult> => ({
          status: "fail",
          failureType: "blocked_publisher",
          details: "Publisher blocked access.",
          statusCode: 403,
        }),
      },
    );

    expect(result).toMatchObject({
      status: "fail",
      failureType: "blocked_publisher",
      publisherStatusCode: 403,
    });
  });

  it("returns short_content when parsing finds too little article text", async () => {
    const result = await enrichArticle(
      { id: "a1", link: "https://news.google.com/rss/articles/a1" },
      new AbortController().signal,
      {
        navigateGoogle: async () => googleWithCanonical(),
        fetchPublisher: async () => ({
          status: "success",
          finalUrl: "https://publisher.example/a1",
          html: "<html><h1>Short</h1><p>tiny</p></html>",
          statusCode: 200,
          bodySource: "direct-http",
        }),
      },
    );

    expect(result).toMatchObject({
      status: "fail",
      failureType: "short_content",
      bodySource: "direct-http",
    });
  });

  it("returns success when publisher content parses cleanly", async () => {
    const result = await enrichArticle(
      { id: "a1", title: "Original", link: "https://news.google.com/rss/articles/a1" },
      new AbortController().signal,
      {
        navigateGoogle: async () => googleWithCanonical(),
        fetchPublisher: async () => ({
          status: "success",
          finalUrl: "https://publisher.example/a1",
          html: `<html><meta property="og:title" content="Publisher title" /><p>${enoughContent}</p></html>`,
          statusCode: 200,
          bodySource: "direct-http",
        }),
      },
    );

    expect(result).toMatchObject({
      articleId: "a1",
      status: "success",
      title: "Publisher title",
      publisherUrl: "https://publisher.example/a1",
      publisherFinalUrl: "https://publisher.example/a1",
      bodySource: "direct-http",
      extractionSource: "canonical",
      resolvedUrl: "https://publisher.example/a1",
    });
  });
});

describe("scrape summary", () => {
  it("starts empty and counts considered, skipped, success, and failed results", () => {
    expect(createEmptyScrapeSummary()).toEqual({
      considered: 0,
      skipped: 0,
      success: 0,
      failed: 0,
    });

    expect(
      summarizeScrapeResults([
        {
          articleId: "success",
          status: "success",
          content: enoughContent,
          extractionSource: "none",
          bodySource: "rss-feed",
        },
        {
          articleId: "skipped",
          status: "fail",
          failureType: "no_publisher_url_found",
          extractionSource: "none",
          bodySource: "none",
        },
        {
          articleId: "failed",
          status: "fail",
          googleRssUrl: "https://news.google.com/rss/articles/failed",
          failureType: "blocked_google",
          extractionSource: "none",
          bodySource: "google-page",
        },
      ]),
    ).toEqual({
      considered: 3,
      skipped: 1,
      success: 1,
      failed: 1,
    });
  });
});

function googleWithCanonical() {
  return {
    status: "success" as const,
    finalUrl: "https://news.google.com/articles/a1",
    html: '<html><link rel="canonical" href="https://publisher.example/a1" /></html>',
    statusCode: 200,
  };
}
