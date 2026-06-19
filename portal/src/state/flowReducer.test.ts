import { describe, expect, it } from "vitest";

import {
  applyStateAssignments,
  applyLocationRatings,
  applyScrapeResults,
  clearStatePromptDraft,
  flowReducer,
  resetFlow,
  setArticles,
  setLocationRun,
  setScrapeRun,
  setStatePromptDraft,
  setStateRun,
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

  it("applyLocationRatings sets numbers for scored rows and null for skipped rows", () => {
    const state: FlowState = {
      currentStage: "location",
      articles: [
        {
          id: "article-1",
          title: "Scored",
          source: "Example News",
          description: "desc",
          link: "https://example.com/1",
        },
        {
          id: "article-2",
          title: "Skipped",
          source: "Example News",
          description: "desc",
          link: "https://example.com/2",
        },
        {
          id: "article-3",
          title: "Untouched",
          source: "Example News",
          description: "desc",
          link: "https://example.com/3",
        },
      ],
    };

    const nextState = flowReducer(
      state,
      applyLocationRatings(
        [{ article_id: "article-1", score: 0.92 }],
        ["article-2"],
      ),
    );

    expect(nextState.articles[0].locationRating).toBe(0.92);
    expect(nextState.articles[1].locationRating).toBeNull();
    expect(nextState.articles[2].locationRating).toBeUndefined();
  });

  it("setArticles clears location run status, and setLocationRun stores it", () => {
    const withRun = flowReducer(
      { currentStage: "location", articles: [] },
      setLocationRun({
        status: "completed",
        processed: 1,
        total: 1,
        summary: { eligible: 1, processed: 1, skipped: 0, modelLoading: 0 },
      }),
    );
    expect(withRun.locationRun?.status).toBe("completed");

    const cleared = flowReducer(
      withRun,
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
    expect(cleared.locationRun).toBeUndefined();
  });

  it("setStateRun stores state run status and prompt draft can be cleared", () => {
    const withRun = flowReducer(
      { currentStage: "state", articles: [] },
      setStateRun({
        status: "completed",
        processed: 1,
        total: 1,
        summary: {
          eligible: 1,
          processed: 1,
          assigned: 1,
          noState: 0,
          failed: 0,
          skipped: 0,
          alreadyAssigned: 0,
        },
        promptUsed: "prompt",
      }),
    );
    const withDraft = flowReducer(withRun, setStatePromptDraft("edited prompt"));
    const clearedDraft = flowReducer(withDraft, clearStatePromptDraft());

    expect(withRun.stateRun?.status).toBe("completed");
    expect(withDraft.statePromptDraft).toBe("edited prompt");
    expect(clearedDraft.statePromptDraft).toBeUndefined();
  });

  it("applyStateAssignments merges by article id and ignores unknown ids", () => {
    const state: FlowState = {
      currentStage: "state",
      articles: [
        {
          id: "article-1",
          title: "First",
          source: "Example News",
          description: "desc",
          link: "https://example.com/1",
        },
        {
          id: "article-2",
          title: "Second",
          source: "Example News",
          description: "desc",
          link: "https://example.com/2",
        },
        {
          id: "article-3",
          title: "Untouched",
          source: "Example News",
          description: "desc",
          link: "https://example.com/3",
        },
      ],
    };

    const nextState = flowReducer(
      state,
      applyStateAssignments([
        {
          articleId: "article-2",
          assignment: {
            occuredInTheUS: false,
            reasoning: "No U.S. location.",
            stateName: "",
            resultStatus: "no_state",
          },
        },
        {
          articleId: "missing",
          assignment: {
            resultStatus: "assigned",
            stateName: "California",
          },
        },
        {
          articleId: "article-1",
          assignment: {
            occuredInTheUS: true,
            reasoning: "Los Angeles is in California.",
            stateName: "California",
            resultStatus: "assigned",
          },
        },
      ]),
    );

    expect(nextState.articles[0].stateAssignment).toMatchObject({
      resultStatus: "assigned",
      stateName: "California",
    });
    expect(nextState.articles[1].stateAssignment).toMatchObject({
      resultStatus: "no_state",
      stateName: "",
    });
    expect(nextState.articles[2].stateAssignment).toBeUndefined();
  });

  it("applyStateAssignments stores content-skipped rows as skipped", () => {
    const state: FlowState = {
      currentStage: "state",
      articles: [
        {
          id: "article-1",
          title: "",
          source: "Example News",
          description: "",
          link: "https://example.com/1",
        },
      ],
    };

    const nextState = flowReducer(
      state,
      applyStateAssignments([
        {
          articleId: "article-1",
          assignment: {
            resultStatus: "skipped",
            errorMessage: "No usable article title or content.",
          },
        },
      ]),
    );

    expect(nextState.articles[0].stateAssignment?.resultStatus).toBe("skipped");
  });

  it("setArticles clears state run status and prompt draft", () => {
    const state: FlowState = {
      currentStage: "state",
      articles: [],
      statePromptDraft: "edited prompt",
      stateRun: {
        status: "completed",
        processed: 1,
        total: 1,
        summary: {
          eligible: 1,
          processed: 1,
          assigned: 1,
          noState: 0,
          failed: 0,
          skipped: 0,
          alreadyAssigned: 0,
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

    expect(nextState.stateRun).toBeUndefined();
    expect(nextState.statePromptDraft).toBeUndefined();
  });
});
