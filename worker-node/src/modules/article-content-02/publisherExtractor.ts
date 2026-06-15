import * as cheerio from "cheerio";

import type { PublisherUrlExtraction, ScrapeExtractionSource } from "./types.js";
import { isGoogleOwnedUrl, toAbsoluteUrl } from "./urlUtils.js";

interface ExtractPublisherUrlInput {
  finalUrl?: string;
  html: string;
}

interface JsonLdObject {
  url?: unknown;
  mainEntityOfPage?: unknown;
  "@graph"?: unknown;
}

export function extractPublisherUrl({
  finalUrl,
  html,
}: ExtractPublisherUrlInput): PublisherUrlExtraction {
  const finalCandidate = chooseCandidate("final-url", finalUrl, finalUrl);
  if (finalCandidate) {
    return finalCandidate;
  }

  const $ = cheerio.load(html);

  return (
    chooseCandidate("canonical", $("link[rel='canonical']").first().attr("href"), finalUrl) ??
    chooseCandidate("og:url", $("meta[property='og:url']").first().attr("content"), finalUrl) ??
    chooseJsonLdCandidate($, finalUrl) ??
    chooseFallbackLink($, finalUrl) ?? { extractionSource: "none" }
  );
}

function chooseCandidate(
  extractionSource: ScrapeExtractionSource,
  candidate: string | undefined,
  baseUrl?: string,
): PublisherUrlExtraction | undefined {
  const publisherUrl = toAbsoluteUrl(candidate, baseUrl);

  if (!publisherUrl || isGoogleOwnedUrl(publisherUrl)) {
    return undefined;
  }

  return {
    publisherUrl,
    extractionSource,
  };
}

function chooseJsonLdCandidate(
  $: cheerio.CheerioAPI,
  baseUrl?: string,
): PublisherUrlExtraction | undefined {
  const scripts = $("script[type='application/ld+json']").toArray();

  for (const script of scripts) {
    const rawJson = $(script).text();

    try {
      const parsed = JSON.parse(rawJson) as JsonLdObject | JsonLdObject[];
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      const candidate = findJsonLdUrl(objects);
      const result = chooseCandidate("json-ld", candidate, baseUrl);

      if (result) {
        return result;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function findJsonLdUrl(objects: JsonLdObject[]): string | undefined {
  for (const object of objects) {
    if (typeof object.url === "string") {
      return object.url;
    }

    if (typeof object.mainEntityOfPage === "string") {
      return object.mainEntityOfPage;
    }

    if (
      object.mainEntityOfPage &&
      typeof object.mainEntityOfPage === "object" &&
      "url" in object.mainEntityOfPage &&
      typeof object.mainEntityOfPage.url === "string"
    ) {
      return object.mainEntityOfPage.url;
    }

    if (Array.isArray(object["@graph"])) {
      const graphUrl = findJsonLdUrl(object["@graph"] as JsonLdObject[]);
      if (graphUrl) {
        return graphUrl;
      }
    }
  }

  return undefined;
}

function chooseFallbackLink(
  $: cheerio.CheerioAPI,
  baseUrl?: string,
): PublisherUrlExtraction | undefined {
  const links = $("a[href]").toArray();

  for (const link of links) {
    const result = chooseCandidate("fallback-link", $(link).attr("href"), baseUrl);

    if (result) {
      return result;
    }
  }

  return undefined;
}
