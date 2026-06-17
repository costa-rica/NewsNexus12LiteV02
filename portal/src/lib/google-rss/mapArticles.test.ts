import { describe, expect, it } from "vitest";

import { assignArticleIds } from "./mapArticles";

describe("assignArticleIds", () => {
  it("adds unique ephemeral IDs and leaves reserved fields unset", () => {
    const articles = assignArticleIds([
      {
        title: "One",
        source: "Source",
        description: "Description",
        link: "https://example.com/one",
      },
      {
        title: "Two",
        source: "Source",
        description: "Description",
        link: "https://example.com/two",
      },
    ]);

    expect(articles).toHaveLength(2);
    expect(articles[0].id).toEqual(expect.any(String));
    expect(articles[1].id).toEqual(expect.any(String));
    expect(articles[0].id).not.toBe(articles[1].id);
    expect(articles[0].scrape).toBeUndefined();
    expect(articles[0].locationRating).toBeUndefined();
    expect(articles[0].stateAssignment).toBeUndefined();
    expect(articles[0].semanticRating).toBeUndefined();
  });
});
