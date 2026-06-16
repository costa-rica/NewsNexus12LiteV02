import type { Article, LocationRunSummary, LocationScore } from "@/state/types";

import { startJob, type StartJobResponse, type WorkerJob } from "./jobClient";

export interface LocationResults {
  scores: LocationScore[];
  skippedIds: string[];
}

export type LocationJob = WorkerJob<LocationResults, LocationRunSummary>;

export function startLocationJob(articles: Article[]): Promise<StartJobResponse> {
  return startJob("location-scorer", { articles });
}
