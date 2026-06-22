import type {
  Article,
  SemanticFailure,
  SemanticRunSummary,
  SemanticScore,
} from "@/state/types";

import { startJob, type StartJobResponse, type WorkerJob } from "./jobClient";

export interface SemanticResults {
  scores: SemanticScore[];
  skippedIds: string[];
  failures: SemanticFailure[];
}

export type SemanticJob = WorkerJob<SemanticResults, SemanticRunSummary>;

export function startSemanticJob(
  articles: Article[],
  keywords: string[],
): Promise<StartJobResponse> {
  return startJob("semantic-scorer", { articles, keywords });
}
