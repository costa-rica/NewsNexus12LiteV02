import type { Article } from "@/state/types";

export interface GoogleRssCriteria {
  and_keywords: string;
  and_exact_phrases: string;
  or_keywords: string;
  or_exact_phrases: string;
  time_range: string;
}

export type GoogleRssErrorCode =
  | "rate_limited"
  | "request_failed"
  | "empty_query";

export interface GoogleRssResponse {
  success: boolean;
  url?: string;
  articlesArray?: Article[];
  count?: number;
  error?: string;
  errorCode?: GoogleRssErrorCode;
}

export type ParsedRssArticle = Pick<
  Article,
  "title" | "source" | "description" | "link" | "pubDate" | "content"
>;
