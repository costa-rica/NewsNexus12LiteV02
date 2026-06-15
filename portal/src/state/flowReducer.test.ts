import { describe, expect, it } from "vitest";

import {
  applyScrapeResults,
  flowReducer,
  resetFlow,
  setArticles,
  setScrapeRun,
  setStage,
} from "./flowReducer";
import type { FlowState } from "./types";

describe("flowReducer", () => {
  it("resetFlow clears articles and returns to search", () => {
    const populatedState: FlowState = flowReducer(
      {
        currentStage: "search",
        articles: [],
      },
      setArticles([
        {
          id: "article-1",
          title: "Example",
          source: "Example News",
          description: "Example description",
          link: "https://example.com",
          locationRating: 0.8,
        },
      ]),
    );

    const stagedState = flowReducer(populatedState, setStage("semantic"));
    const scrapedState = flowReducer(
      flowReducer(
        stagedState,
        setScrapeRun({
          status: "completed",
          processed: 1,
          total: 1,
          summary: {
            considered: 1,
            skipped: 0,
            success: 1,
            failed: 0,
          },
        }),
      ),
      applyScrapeResults([
        {
          articleId: "article-1",
          status: "success",
          content: "scraped content",
        },
      ]),
    );
    const resetState = flowReducer(scrapedState, resetFlow());

    expect(resetState).toEqual({
      currentStage: "search",
      articles: [],
    });
  });

  it("applyScrapeResults merges success and failure results by article id", () => {
    const state: FlowState = {
      currentStage: "scrape",
      articles: [
        {
          id: "article-1",
          title: "First",
          source: "Example News",
          description: "First description",
          link: "https://example.com/first",
          locationRating: 0.8,
        },
        {
          id: "article-2",
          title: "Second",
          source: "Example News",
          description: "Second description",
          link: "https://example.com/second",
        },
      ],
    };

    const nextState = flowReducer(
      state,
      applyScrapeResults([
        {
          articleId: "article-1",
          status: "success",
          content: "a".repeat(200),
          publisherUrl: "https://publisher.example/first",
        },
        {
          articleId: "article-2",
          status: "fail",
          failureType: "blocked_google",
          details: "Google blocked the request.",
        },
      ]),
    );

    expect(nextState.articles[0]).toMatchObject({
      id: "article-1",
      locationRating: 0.8,
      scrape: {
        status: "success",
        content: "a".repeat(200),
        publisherUrl: "https://publisher.example/first",
      },
    });
    expect(nextState.articles[1].scrape).toMatchObject({
      status: "fail",
      failureType: "blocked_google",
      details: "Google blocked the request.",
    });
  });

  it("setArticles replaces the working set and clears scrape run status", () => {
    const state: FlowState = {
      currentStage: "scrape",
      articles: [],
      scrapeRun: {
        status: "completed",
        processed: 1,
        total: 1,
        summary: {
          considered: 1,
          skipped: 0,
          success: 1,
          failed: 0,
        },
      },
    };

    const nextState = flowReducer(
      state,
      setArticles([
        {
          id: "article-1",
          title: "Fresh",
          source: "Example News",
          description: "Fresh description",
          link: "https://example.com/fresh",
        },
      ]),
    );

    expect(nextState.scrapeRun).toBeUndefined();
    expect(nextState.articles[0].scrape).toBeUndefined();
  });
});
