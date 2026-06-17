import { describe, expect, it } from "vitest";

import { parseRssItems, RssParseError } from "./parse";

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item>
      <title>Anchor story</title>
      <link>https://example.com/anchor</link>
      <description><![CDATA[<a href="https://source.example">Source Name</a><p>Extra description</p>]]></description>
      <source url="https://source.example">Source Name</source>
      <pubDate>Mon, 15 Jun 2026 10:00:00 GMT</pubDate>
      <content:encoded><![CDATA[Full content]]></content:encoded>
    </item>
    <item>
      <title>Plain story</title>
      <link>https://example.com/plain</link>
      <description><![CDATA[<p>Plain <strong>description</strong></p>]]></description>
      <source>String Source</source>
      <pubDate>Mon, 15 Jun 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe("parseRssItems", () => {
  it("maps RSS items and prefers first anchor text for descriptions", async () => {
    const items = await parseRssItems(fixtureXml);

    expect(items[0]).toEqual({
      title: "Anchor story",
      link: "https://example.com/anchor",
      description: "Source Name",
      source: "Source Name",
      pubDate: "Mon, 15 Jun 2026 10:00:00 GMT",
      content: "Full content",
    });
  });

  it("strips HTML when no anchor text exists and supports string source fallback", async () => {
    const items = await parseRssItems(fixtureXml);

    expect(items[1]).toEqual({
      title: "Plain story",
      link: "https://example.com/plain",
      description: "Plain description",
      source: "String Source",
      pubDate: "Mon, 15 Jun 2026 11:00:00 GMT",
      content: undefined,
    });
  });

  it("throws a typed parse failure for invalid XML", async () => {
    await expect(parseRssItems("<rss>")).rejects.toBeInstanceOf(RssParseError);
  });

  it("throws a typed parse failure when the RSS channel is missing", async () => {
    await expect(parseRssItems("<rss></rss>")).rejects.toBeInstanceOf(
      RssParseError,
    );
  });
});
