import type { Article, ScrapeResult, ScrapeRunSummary } from "@/state/types";

import { startJob, type StartJobResponse, type WorkerJob } from "./jobClient";

export type ScrapeJob = WorkerJob<ScrapeResult[], ScrapeRunSummary>;

export function startScrapeJob(articles: Article[]): Promise<StartJobResponse> {
  return startJob("article-content-scraper-02", { articles });
}
