import { describe, expect, it } from "vitest";

import { flowReducer, resetFlow, setArticles, setStage } from "./flowReducer";
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
    const resetState = flowReducer(stagedState, resetFlow());

    expect(resetState).toEqual({
      currentStage: "search",
      articles: [],
    });
  });
});
