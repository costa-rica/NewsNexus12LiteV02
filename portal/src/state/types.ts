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

export interface LocationScore {
  article_id: ArticleId;
  score: number;
}

export interface LocationRunSummary {
  eligible: number;
  processed: number;
  skipped: number;
  // 1 while the model is loading, 0 otherwise.
  modelLoading: number;
}

export interface LocationRunStatus {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  processed: number;
  total: number;
  summary: LocationRunSummary;
}

export type StateResultStatus = "assigned" | "no_state" | "failed" | "skipped";

export interface StateAssignment {
  occuredInTheUS?: boolean;
  reasoning?: string;
  stateName?: string;
  rawStateText?: string;
  resultStatus: StateResultStatus;
  errorMessage?: string;
}

export interface StateAssignmentResult {
  articleId: ArticleId;
  assignment: StateAssignment;
}

export interface StateRunSummary {
  eligible: number;
  processed: number;
  assigned: number;
  noState: number;
  failed: number;
  skipped: number;
  alreadyAssigned?: number;
}

export interface StateRunStatus {
  status: "idle" | "queued" | "running" | "completed" | "failed" | "cancelled";
  processed: number;
  total: number;
  summary: StateRunSummary;
  promptUsed?: string;
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
  locationRun?: LocationRunStatus;
  stateRun?: StateRunStatus;
  statePromptDraft?: string;
}
