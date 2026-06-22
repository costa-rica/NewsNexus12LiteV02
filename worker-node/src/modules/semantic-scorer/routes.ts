import { Router } from "express";

import { sendError } from "../../http/errors.js";
import { createJob } from "../../jobs/registry.js";
import { logInfo } from "../../logger.js";
import { runSemanticJob } from "./processor.js";
import { createSemanticScorer } from "./scorer.js";
import {
  createEmptySemanticSummary,
  type SemanticArticleInput,
  type SemanticResults,
  type SemanticScorer,
} from "./types.js";

const ENDPOINT_NAME = "semantic-scorer";

interface SemanticScorerRouterOptions {
  scorer?: SemanticScorer;
}

interface StartSemanticJobBody {
  articles?: unknown;
  keywords?: unknown;
}

export function createSemanticScorerRouter(
  options: SemanticScorerRouterOptions = {},
) {
  const router = Router();
  const scorer = options.scorer ?? createSemanticScorer();

  router.post(`/${ENDPOINT_NAME}/start-job`, (request, response) => {
    const body = request.body as StartSemanticJobBody;

    if (!Array.isArray(body.articles)) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Request must include an articles array",
        status: 400,
        logMeta: { reason: "invalid_articles" },
      });
      return;
    }

    if (!Array.isArray(body.keywords)) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Request must include a keywords array",
        status: 400,
        logMeta: { reason: "invalid_keywords" },
      });
      return;
    }

    const articles = body.articles.filter(isSemanticArticleInput);
    const keywords = body.keywords
      .filter((keyword): keyword is string => typeof keyword === "string")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (articles.length !== body.articles.length) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Each article must include a non-empty string id",
        status: 400,
        logMeta: { reason: "invalid_article_shape" },
      });
      return;
    }

    if (keywords.length === 0) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "At least one semantic keyword is required",
        status: 400,
        logMeta: { reason: "empty_keywords" },
      });
      return;
    }

    const job = createJob<SemanticResults>(ENDPOINT_NAME, articles.length, {
      endpointName: ENDPOINT_NAME,
      summary: { ...createEmptySemanticSummary() },
    });

    logInfo("semantic job accepted", {
      jobId: job.jobId,
      total: articles.length,
      keywordCount: keywords.length,
      endpointName: ENDPOINT_NAME,
    });

    response.status(202).json({
      jobId: job.jobId,
      status: job.status,
      endpointName: job.endpointName,
    });

    setImmediate(() => {
      void runSemanticJob({ job, articles, keywords, scorer });
    });
  });

  return router;
}

function isSemanticArticleInput(value: unknown): value is SemanticArticleInput {
  if (!value || typeof value !== "object" || !("id" in value)) {
    return false;
  }

  const article = value as { id?: unknown };
  return typeof article.id === "string" && article.id.length > 0;
}
