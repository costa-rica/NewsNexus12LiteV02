export interface SemanticArticleInput {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  scrape?: {
    status?: "success" | "fail";
    content?: string;
  };
  semanticRatingMax?: number | null;
  semanticRating?: number | null;
}

export interface SemanticScore {
  article_id: string;
  score: number;
  rating_for: string;
}

export interface SemanticFailure {
  article_id: string;
  reason: "timeout" | "error" | "no_score";
}

export interface SemanticResults {
  scores: SemanticScore[];
  skippedIds: string[];
  failures: SemanticFailure[];
}

export interface SemanticSummary {
  eligible: number;
  processed: number;
  skipped: number;
  failed: number;
  // 1 while the model is loading, 0 otherwise (JobSummary is numbers-only).
  modelLoading: number;
}

export interface SemanticScorer {
  load(): Promise<void>;
  score(text: string, keywords: string[]): Promise<SemanticScoreCandidate | null>;
}

export interface SemanticScoreCandidate {
  score: number;
  label: string;
}

export function createEmptySemanticSummary(): SemanticSummary {
  return { eligible: 0, processed: 0, skipped: 0, failed: 0, modelLoading: 0 };
}
