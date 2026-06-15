import { NextResponse } from "next/server";

import { applyArticleLimit } from "@/lib/google-rss/limit";
import { assignArticleIds } from "@/lib/google-rss/mapArticles";
import { parseRssItems } from "@/lib/google-rss/parse";
import { buildGoogleRssQuery } from "@/lib/google-rss/queryBuilder";
import { fetchGoogleRss } from "@/lib/google-rss/rssFetcher";
import type {
  GoogleRssCriteria,
  GoogleRssErrorCode,
  GoogleRssResponse,
} from "@/lib/google-rss/types";
import { buildGoogleRssUrl } from "@/lib/google-rss/url";

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

function errorResponse(
  errorCode: GoogleRssErrorCode,
  error: string,
  status: number,
) {
  return NextResponse.json(
    {
      success: false,
      errorCode,
      error,
    } satisfies GoogleRssResponse,
    { status },
  );
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
    return errorResponse("empty_query", "Enter a search query.", 400);
  }

  const query = buildGoogleRssQuery(criteria);
  const url = buildGoogleRssUrl(query);
  const fetchResult = await fetchGoogleRss(url);

  if (fetchResult.status === "error") {
    return errorResponse(
      fetchResult.errorCode,
      fetchResult.error,
      fetchResult.errorCode === "rate_limited" ? 503 : 500,
    );
  }

  try {
    const parsedItems = await parseRssItems(fetchResult.xml);
    const limitedItems = applyArticleLimit(parsedItems);
    const articles = assignArticleIds(limitedItems);

    return NextResponse.json({
      success: true,
      url,
      articlesArray: articles,
      count: articles.length,
    } satisfies GoogleRssResponse);
  } catch {
    return errorResponse(
      "request_failed",
      "Failed to parse Google News RSS response.",
      500,
    );
  }
}
