import { Router } from "express";

import { sendError } from "../../http/errors.js";
import { createJob } from "../../jobs/registry.js";
import { runJob } from "../../jobs/runner.js";
import { logInfo } from "../../logger.js";
import { loadArticleContentConfig } from "./config.js";
import {
  createArticleContentProcessor,
  createEmptyScrapeSummary,
  processArticleWithTimeout,
  type ScrapeProcessor,
  summarizeScrapeResults,
} from "./enrichment.js";
import type { ScrapeArticleInput, ScrapeResult } from "./types.js";

const ENDPOINT_NAME = "article-content-scraper-02";

interface ArticleContentScraperRouterOptions {
  processArticle?: ScrapeProcessor;
}

interface StartScrapeJobBody {
  articles?: unknown;
}

export function createArticleContentScraperRouter(
  options: ArticleContentScraperRouterOptions = {},
) {
  const router = Router();
  const config = loadArticleContentConfig();
  const processArticle = options.processArticle ?? createArticleContentProcessor({ config });

  router.post(`/${ENDPOINT_NAME}/start-job`, (request, response) => {
    const body = request.body as StartScrapeJobBody;

    if (!Array.isArray(body.articles)) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Request must include an articles array",
        status: 400,
        logMeta: { reason: "invalid_articles" },
      });
      return;
    }

    const articles = body.articles.filter(isScrapeArticleInput);

    if (articles.length !== body.articles.length) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Each article must include a non-empty string id",
        status: 400,
        logMeta: { reason: "invalid_article_shape" },
      });
      return;
    }

    const job = createJob<ScrapeResult[]>(ENDPOINT_NAME, articles.length, {
      endpointName: ENDPOINT_NAME,
      summary: createEmptyScrapeSummary(),
    });

    logInfo("scrape job accepted", {
      jobId: job.jobId,
      total: articles.length,
      endpointName: ENDPOINT_NAME,
    });

    response.status(202).json({
      jobId: job.jobId,
      status: job.status,
      endpointName: job.endpointName,
    });

    setImmediate(() => {
      void runJob({
        job,
        items: articles,
        processItem: (article, signal) =>
          processArticleWithTimeout(article, signal, processArticle, config.articleTimeoutMs),
        summarizeResults: summarizeScrapeResults,
      });
    });
  });

  return router;
}

function isScrapeArticleInput(value: unknown): value is ScrapeArticleInput {
  if (!value || typeof value !== "object" || !("id" in value)) {
    return false;
  }

  const article = value as { id?: unknown };

  return typeof article.id === "string" && article.id.length > 0;
}
