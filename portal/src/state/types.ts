export type ArticleId = string;

export type StageKey = "search" | "scrape" | "location" | "state" | "semantic";

/**
 * Reserved stage 3 scrape result shape. Later stages may extend this with the
 * exact worker response fields without changing the Article contract.
 */
export interface ScrapeResult {
  content?: string;
  resolvedUrl?: string;
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
  // Per-stage run status is introduced by the stage that needs it. Stage 1
  // reserves the concept only and does not implement jobs, IDs, or polling.
}
