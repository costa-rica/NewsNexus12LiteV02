import { parseStringPromise } from "xml2js";

import type { ParsedRssArticle } from "./types";

type SourceValue = string | { _: string };

interface RssXmlItem {
  title?: string[];
  description?: string[];
  link?: string[];
  pubDate?: string[];
  source?: SourceValue[];
  "content:encoded"?: string[];
}

interface ParsedRssXml {
  rss?: {
    channel?: Array<{
      item?: RssXmlItem[];
    }>;
  };
}

export class RssParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RssParseError";
  }
}

function stripHtml(input: string) {
  return input.replace(/<[^>]*>/g, "").trim();
}

function extractAnchorText(input: string) {
  const match = input.match(/<a[^>]*>(.*?)<\/a>/i);
  return match?.[1] ? stripHtml(match[1]) : null;
}

function readString(value: string[] | undefined) {
  return value?.[0] ?? "";
}

function readSource(value: SourceValue[] | undefined) {
  const source = value?.[0];

  if (!source) {
    return "";
  }

  return typeof source === "string" ? source : source._;
}

export async function parseRssItems(xml: string): Promise<ParsedRssArticle[]> {
  let parsed: ParsedRssXml;

  try {
    parsed = (await parseStringPromise(xml, {
      explicitArray: true,
    })) as ParsedRssXml;
  } catch (error) {
    throw new RssParseError(
      error instanceof Error ? error.message : "Invalid RSS XML",
    );
  }

  const channel = parsed.rss?.channel?.[0];

  if (!channel) {
    throw new RssParseError("RSS channel is missing");
  }

  return (channel.item ?? []).map((item) => {
    const rawDescription = readString(item.description);
    const description =
      extractAnchorText(rawDescription) ||
      stripHtml(rawDescription) ||
      rawDescription;

    return {
      title: readString(item.title),
      link: readString(item.link),
      description,
      source: readSource(item.source),
      pubDate: readString(item.pubDate) || undefined,
      content: readString(item["content:encoded"]) || undefined,
    };
  });
}
