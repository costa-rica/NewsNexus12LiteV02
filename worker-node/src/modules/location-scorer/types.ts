export const US_LABEL = "Occurred in the United States";
export const NON_US_LABEL = "Occurred outside the United States";
export const LOCATION_LABELS = [US_LABEL, NON_US_LABEL] as const;

export interface LocationArticleInput {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  scrape?: {
    status?: "success" | "fail";
    content?: string;
  };
  locationRating?: number | null;
}

export interface LocationScore {
  article_id: string;
  score: number;
  rating_for: typeof US_LABEL;
}

export interface LocationResults {
  scores: LocationScore[];
  skippedIds: string[];
}

export interface LocationSummary {
  eligible: number;
  processed: number;
  skipped: number;
  // 1 while the model is loading, 0 otherwise (JobSummary is numbers-only).
  modelLoading: number;
}

export function createEmptyLocationSummary(): LocationSummary {
  return { eligible: 0, processed: 0, skipped: 0, modelLoading: 0 };
}

/** Shape returned by the zero-shot classifier (transformers.js). */
export interface ZeroShotResult {
  labels: string[];
  scores: number[];
}

export interface LocationClassifier {
  load(): Promise<void>;
  score(text: string): Promise<number>;
}
