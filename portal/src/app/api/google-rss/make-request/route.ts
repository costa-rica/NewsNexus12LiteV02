import { NextResponse } from "next/server";

import { errorJson } from "@/lib/http/errors";
import { applyArticleLimit } from "@/lib/google-rss/limit";
import { assignArticleIds } from "@/lib/google-rss/mapArticles";
import { parseRssItems } from "@/lib/google-rss/parse";
import { buildGoogleRssQuery } from "@/lib/google-rss/queryBuilder";
import { fetchGoogleRss } from "@/lib/google-rss/rssFetcher";
import type {
  GoogleRssCriteria,
  GoogleRssSuccessResponse,
} from "@/lib/google-rss/types";
import { buildGoogleRssUrl } from "@/lib/google-rss/url";
import { logInfo } from "@/lib/serverLogger";

type PartialCriteria = Partial<Record<keyof GoogleRssCriteria, unknown>>;

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeCriteria(body: PartialCriteria): GoogleRssCriteria {
  return {
    and_keywords: readString(body.and_keywords),
    and_exact_phrases: readString(body.and_exact_phrases),
    or_keywords: readString(body.or_keywords),
    or_exact_phrases: readString(body.or_exact_phrases),
    time_range: readString(body.time_range) || "7d",
  };
}

function summarizeCriteria(criteria: GoogleRssCriteria) {
  return {
    route: "google-rss.make-request",
    andKeywordsLength: criteria.and_keywords.trim().length,
    hasExactPhrases: criteria.and_exact_phrases.trim().length > 0,
    hasOrKeywords: criteria.or_keywords.trim().length > 0,
    hasOrExactPhrases: criteria.or_exact_phrases.trim().length > 0,
    timeRange: criteria.time_range,
  };
}

export async function POST(request: Request) {
  let body: PartialCriteria = {};

  try {
    body = (await request.json()) as PartialCriteria;
  } catch {
    body = {};
  }

  const criteria = normalizeCriteria(body);

  if (!criteria.and_keywords.trim()) {
    return errorJson({
      code: "VALIDATION_ERROR",
      message: "Enter a search query.",
      status: 400,
      logMeta: { route: "google-rss.make-request", failure: "empty_query" },
    });
  }

  const query = buildGoogleRssQuery(criteria);
  const url = buildGoogleRssUrl(query);
  logInfo("google rss search requested", summarizeCriteria(criteria));

  const fetchResult = await fetchGoogleRss(url);

  if (fetchResult.status === "error") {
    if (fetchResult.errorCode === "rate_limited") {
      return errorJson({
        code: "SERVICE_UNAVAILABLE",
        message: "Google News RSS temporarily unavailable, retry later.",
        status: 503,
        details: fetchResult.error,
        logMeta: {
          route: "google-rss.make-request",
          failure: fetchResult.errorCode,
        },
      });
    }

    return errorJson({
      code: "INTERNAL_ERROR",
      message: "Request failed. Please try again.",
      status: 500,
      details: fetchResult.error,
      logMeta: {
        route: "google-rss.make-request",
        failure: fetchResult.errorCode,
      },
    });
  }

  try {
    const parsedItems = await parseRssItems(fetchResult.xml);
    const limitedItems = applyArticleLimit(parsedItems);
    const articles = assignArticleIds(limitedItems);
    logInfo("google rss search completed", {
      route: "google-rss.make-request",
      parsedCount: parsedItems.length,
      count: articles.length,
    });

    return NextResponse.json({
      url,
      articlesArray: articles,
      count: articles.length,
    } satisfies GoogleRssSuccessResponse);
  } catch (error) {
    return errorJson({
      code: "INTERNAL_ERROR",
      message: "Request failed. Please try again.",
      status: 500,
      details: error instanceof Error ? error.message : "parse_failed",
      logMeta: { route: "google-rss.make-request", failure: "parse_failed" },
    });
  }
}
