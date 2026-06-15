import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const successXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item>
      <title>Search result</title>
      <link>https://example.com/article</link>
      <description><![CDATA[<a href="https://example.com">Example News</a>Article text]]></description>
      <source url="https://example.com">Example News</source>
      <pubDate>Mon, 15 Jun 2026 10:00:00 GMT</pubDate>
      <content:encoded><![CDATA[Full content]]></content:encoded>
    </item>
  </channel>
</rss>`;

const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <title>Empty feed</title>
  </channel>
</rss>`;

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/google-rss/make-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function mockFetchResponse(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("POST /api/google-rss/make-request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns shaped articles with ephemeral ids on success", async () => {
    mockFetchResponse(new Response(successXml, { status: 200 }));

    const response = await POST(
      makeRequest({
        and_keywords: "fire",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.url).toContain("https://news.google.com/rss/search");
    expect(body.articlesArray[0]).toMatchObject({
      id: expect.any(String),
      title: "Search result",
      link: "https://example.com/article",
      description: "Example News",
      source: "Example News",
      pubDate: "Mon, 15 Jun 2026 10:00:00 GMT",
      content: "Full content",
    });
  });

  it("returns empty_query without calling fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await POST(makeRequest({ and_keywords: "   " }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      errorCode: "empty_query",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps HTTP 503 to rate_limited", async () => {
    mockFetchResponse(new Response("", { status: 503 }));

    const response = await POST(makeRequest({ and_keywords: "fire" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("rate_limited");
  });

  it("maps other non-OK responses to request_failed", async () => {
    mockFetchResponse(new Response("", { status: 500 }));

    const response = await POST(makeRequest({ and_keywords: "fire" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("request_failed");
  });

  it("maps malformed XML to request_failed", async () => {
    mockFetchResponse(new Response("<rss>", { status: 200 }));

    const response = await POST(makeRequest({ and_keywords: "fire" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("request_failed");
  });

  it("returns success with zero count for an empty feed", async () => {
    mockFetchResponse(new Response(emptyXml, { status: 200 }));

    const response = await POST(makeRequest({ and_keywords: "unlikely" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      count: 0,
      articlesArray: [],
    });
  });
});
