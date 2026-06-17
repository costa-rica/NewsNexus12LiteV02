import { describe, expect, it } from "vitest";

import { extractPublisherUrl } from "./publisherExtractor.js";

describe("extractPublisherUrl", () => {
  it("prefers a non-Google final URL", () => {
    const result = extractPublisherUrl({
      finalUrl: "https://publisher.example/article",
      html: "<html></html>",
    });

    expect(result).toEqual({
      publisherUrl: "https://publisher.example/article",
      extractionSource: "final-url",
    });
  });

  it("discovers canonical before og:url and json-ld", () => {
    const html = `
      <link rel="canonical" href="https://publisher.example/canonical" />
      <meta property="og:url" content="https://publisher.example/og" />
      <script type="application/ld+json">{"url":"https://publisher.example/json"}</script>
    `;

    expect(
      extractPublisherUrl({
        finalUrl: "https://news.google.com/articles/abc",
        html,
      }),
    ).toEqual({
      publisherUrl: "https://publisher.example/canonical",
      extractionSource: "canonical",
    });
  });

  it("falls back to json-ld and links while rejecting Google-owned candidates", () => {
    const jsonLdResult = extractPublisherUrl({
      finalUrl: "https://news.google.com/articles/abc",
      html: `
        <link rel="canonical" href="https://www.google.com/article" />
        <script type="application/ld+json">{"mainEntityOfPage":{"url":"https://publisher.example/json"}}</script>
      `,
    });

    expect(jsonLdResult).toEqual({
      publisherUrl: "https://publisher.example/json",
      extractionSource: "json-ld",
    });

    const fallbackResult = extractPublisherUrl({
      finalUrl: "https://news.google.com/articles/abc",
      html: `
        <a href="https://google.com/ignore">Google</a>
        <a href="https://publisher.example/article">Publisher</a>
      `,
    });

    expect(fallbackResult).toEqual({
      publisherUrl: "https://publisher.example/article",
      extractionSource: "fallback-link",
    });
  });

  it("returns none when no publisher candidate exists", () => {
    expect(
      extractPublisherUrl({
        finalUrl: "https://news.google.com/articles/abc",
        html: "<a href='https://google.com/ignore'>Google</a>",
      }),
    ).toEqual({ extractionSource: "none" });
  });
});
