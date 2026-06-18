import { Router } from "express";

import { sendError } from "../../http/errors.js";
import { createJob } from "../../jobs/registry.js";
import { logInfo } from "../../logger.js";
import { loadLocationScorerConfig } from "./config.js";
import { runLocationJob } from "./processor.js";
import { createThreadLocationClassifier } from "./threadClassifier.js";
import {
  createEmptyLocationSummary,
  type LocationArticleInput,
  type LocationClassifier,
  type LocationResults,
} from "./types.js";

const ENDPOINT_NAME = "location-scorer";

interface LocationScorerRouterOptions {
  classifier?: LocationClassifier;
}

interface StartLocationJobBody {
  articles?: unknown;
}

export function createLocationScorerRouter(
  options: LocationScorerRouterOptions = {},
) {
  const router = Router();
  const config = loadLocationScorerConfig();
  const classifier = options.classifier ?? createThreadLocationClassifier(config);

  router.post(`/${ENDPOINT_NAME}/start-job`, (request, response) => {
    const body = request.body as StartLocationJobBody;

    if (!Array.isArray(body.articles)) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Request must include an articles array",
        status: 400,
        logMeta: { reason: "invalid_articles" },
      });
      return;
    }

    const articles = body.articles.filter(isLocationArticleInput);

    if (articles.length !== body.articles.length) {
      sendError(response, {
        code: "VALIDATION_ERROR",
        message: "Each article must include a non-empty string id",
        status: 400,
        logMeta: { reason: "invalid_article_shape" },
      });
      return;
    }

    const job = createJob<LocationResults>(ENDPOINT_NAME, articles.length, {
      endpointName: ENDPOINT_NAME,
      summary: { ...createEmptyLocationSummary() },
    });

    logInfo("location job accepted", {
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
      void runLocationJob({ job, articles, classifier });
    });
  });

  return router;
}

function isLocationArticleInput(value: unknown): value is LocationArticleInput {
  if (!value || typeof value !== "object" || !("id" in value)) {
    return false;
  }

  const article = value as { id?: unknown };
  return typeof article.id === "string" && article.id.length > 0;
}
