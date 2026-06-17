export type ScrapeStatus = "success" | "fail";

export type ScrapeFailureType =
  | "blocked_google"
  | "blocked_publisher"
  | "no_publisher_url_found"
  | "navigation_error"
  | "publisher_fetch_error"
  | "short_content";

export type ScrapeExtractionSource =
  | "final-url"
  | "canonical"
  | "og:url"
  | "json-ld"
  | "fallback-link"
  | "none";

export type ScrapeBodySource =
  | "rss-feed"
  | "direct-http"
  | "playwright-publisher"
  | "google-page"
  | "none";

export interface ScrapeArticleInput {
  id: string;
  title?: string;
  source?: string;
  description?: string;
  link?: string;
  url?: string;
  content?: string;
}

export interface ScrapeResult {
  articleId: string;
  googleRssUrl?: string;
  googleFinalUrl?: string;
  publisherUrl?: string;
  publisherFinalUrl?: string;
  title?: string;
  content?: string;
  status: ScrapeStatus;
  failureType?: ScrapeFailureType;
  details?: string;
  extractionSource: ScrapeExtractionSource;
  bodySource: ScrapeBodySource;
  googleStatusCode?: number;
  publisherStatusCode?: number;
  resolvedUrl?: string;
}

export interface ScrapeSummary extends Record<string, number> {
  considered: number;
  skipped: number;
  success: number;
  failed: number;
}

export interface PublisherUrlExtraction {
  publisherUrl?: string;
  extractionSource: ScrapeExtractionSource;
}

export interface ParsedArticle {
  status: ScrapeStatus;
  title?: string;
  content?: string;
  failureType?: "short_content";
  details?: string;
}
