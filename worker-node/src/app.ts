import express from "express";

import { errorMiddleware } from "./http/errors.js";
import { jobRouter } from "./jobs/routes.js";
import type { ScrapeProcessor } from "./modules/article-content-02/enrichment.js";
import { createArticleContentScraperRouter } from "./modules/article-content-02/routes.js";

interface CreateAppOptions {
  scrapeProcessor?: ScrapeProcessor;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use(jobRouter);
  app.use(
    createArticleContentScraperRouter({
      processArticle: options.scrapeProcessor,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
