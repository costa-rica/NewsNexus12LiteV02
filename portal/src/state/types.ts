export type ArticleId = string;

export type StageKey = "search" | "scrape" | "location" | "state" | "semantic";

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

export interface ScrapeResult {
  articleId?: ArticleId;
  googleRssUrl?: string;
  googleFinalUrl?: string;
  publisherUrl?: string;
  publisherFinalUrl?: string;
  title?: string;
  content?: string;
  status?: "success" | "fail";
  failureType?: ScrapeFailureType;
  details?: string;
  extractionSource?: ScrapeExtractionSource;
  bodySource?: ScrapeBodySource;
  googleStatusCode?: number;
  publisherStatusCode?: number;
  resolvedUrl?: string;
}

export interface ScrapeRunSummary {
  considered: number;
  skipped: number;
  success: number;
  failed: number;
}

export interface ScrapeRunStatus {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  processed: number;
  total: number;
  summary: ScrapeRunSummary;
}

/**
 * Reserved stage 5 state assignment shape. It is intentionally minimal here so
 * stage 1 does not pre-build AI assignment behavior.
 */
export interface StateAssignment {
  stateName?: string;
  confidence?: number | null;
}

export interface Article {
  id: ArticleId;
  title: string;
  source: string;
  description: string;
  link: string;
  pubDate?: string;
  content?: string;
  scrape?: ScrapeResult;
  locationRating?: number | null;
  stateAssignment?: StateAssignment;
  semanticRating?: number | null;
}

export interface FlowState {
  currentStage: StageKey;
  articles: Article[];
  scrapeRun?: ScrapeRunStatus;
}
