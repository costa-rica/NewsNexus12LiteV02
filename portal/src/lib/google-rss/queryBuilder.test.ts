import { describe, expect, it } from "vitest";

import type { GoogleRssCriteria } from "./types";
import { buildGoogleRssQuery } from "./queryBuilder";

function criteria(andKeywords: string): GoogleRssCriteria {
  return {
    and_keywords: andKeywords,
    and_exact_phrases: "",
    or_keywords: "",
    or_exact_phrases: "",
    time_range: "7d",
  };
}

describe("buildGoogleRssQuery", () => {
  it("splits comma-separated AND terms, trims them, and appends the time range", () => {
    expect(buildGoogleRssQuery(criteria(" fire, emergency ,  rescue "))).toBe(
      "fire emergency rescue when:7d",
    );
  });

  it("preserves existing matching quotes", () => {
    expect(buildGoogleRssQuery(criteria("'wild fire', \"public safety\""))).toBe(
      "'wild fire' \"public safety\" when:7d",
    );
  });

  it("wraps unquoted terms containing spaces", () => {
    expect(buildGoogleRssQuery(criteria("wild fire, evacuation order"))).toBe(
      '"wild fire" "evacuation order" when:7d',
    );
  });

  it("drops empty terms", () => {
    expect(buildGoogleRssQuery(criteria("fire, , , smoke"))).toBe(
      "fire smoke when:7d",
    );
  });
});
