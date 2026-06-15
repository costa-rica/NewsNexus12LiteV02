import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGoogleRssUrl } from "./url";

describe("buildGoogleRssUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses Google News RSS defaults", () => {
    const url = new URL(buildGoogleRssUrl("fire when:7d"));

    expect(url.origin + url.pathname).toBe(
      "https://news.google.com/rss/search",
    );
    expect(url.searchParams.get("q")).toBe("fire when:7d");
    expect(url.searchParams.get("hl")).toBe("en-US");
    expect(url.searchParams.get("gl")).toBe("US");
    expect(url.searchParams.get("ceid")).toBe("US:en");
  });

  it("uses environment locale overrides", () => {
    vi.stubEnv("GOOGLE_RSS_HL", "en-GB");
    vi.stubEnv("GOOGLE_RSS_GL", "GB");
    vi.stubEnv("GOOGLE_RSS_CEID", "GB:en");

    const url = new URL(buildGoogleRssUrl("flood when:7d"));

    expect(url.searchParams.get("hl")).toBe("en-GB");
    expect(url.searchParams.get("gl")).toBe("GB");
    expect(url.searchParams.get("ceid")).toBe("GB:en");
  });
});
