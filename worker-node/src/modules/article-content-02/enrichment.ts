import { type ArticleContentConfig, loadArticleContentConfig } from "./config.js";
import { logInfo, logWarn } from "../../logger.js";
import { classifyGooglePage } from "./googleClassifier.js";
import { navigateGoogleRssUrl, type GoogleNavigationResult } from "./googleNavigator.js";
import type { BrowserPageProvider } from "./navigationSessionManager.js";
import { NavigationSessionManager } from "./navigationSessionManager.js";
import { parseArticleHtml } from "./articleParser.js";
import {
  fetchPublisherArticle,
  type PublisherFetchResult,
} from "./publisherFetcher.js";
import { extractPublisherUrl } from "./publisherExtractor.js";
import type {
  ParsedArticle,
  PublisherUrlExtraction,
  ScrapeArticleInput,
  ScrapeResult,
  ScrapeSummary,
} from "./types.js";
import { normalizeText } from "./urlUtils.js";

export type ScrapeProcessor = (
  article: ScrapeArticleInput,
  signal: AbortSignal,
) => Promise<ScrapeResult>;

interface EnrichmentDependencies {
  config?: ArticleContentConfig;
  sessionManager?: BrowserPageProvider;
  navigateGoogle?: (
    url: string,
    signal: AbortSignal,
  ) => Promise<GoogleNavigationResult>;
  fetchPublisher?: (
    publisherUrl: string,
    signal: AbortSignal,
  ) => Promise<PublisherFetchResult>;
  extractPublisher?: (input: { finalUrl?: string; html: string }) => PublisherUrlExtraction;
  parseArticle?: (html: string) => ParsedArticle;
}

export function createArticleContentProcessor(
  dependencies: EnrichmentDependencies = {},
): ScrapeProcessor {
  const config = dependencies.config ?? loadArticleContentConfig();
  const sessionManager = dependencies.sessionManager ?? new NavigationSessionManager(config);

  return (article, signal) =>
    enrichArticle(article, signal, {
      ...dependencies,
      config,
      sessionManager,
    });
}

export async function enrichArticle(
  article: ScrapeArticleInput,
  signal: AbortSignal,
  dependencies: EnrichmentDependencies = {},
): Promise<ScrapeResult> {
  const config = dependencies.config ?? loadArticleContentConfig();
  const url = article.link ?? article.url;
  const rssContent = normalizeText(article.content ?? "");

  if (rssContent.length >= config.contentMinLength) {
    logInfo("article scrape succeeded", {
      articleId: article.id,
      bodySource: "rss-feed",
      extractionSource: "none",
    });

    return {
      articleId: article.id,
      googleRssUrl: url,
      title: article.title,
      content: rssContent,
      status: "success",
      extractionSource: "none",
      bodySource: "rss-feed",
    };
  }

  if (!url) {
    return createFailureResult(article, {
      failureType: "no_publisher_url_found",
      details: "Article did not include a URL.",
      extractionSource: "none",
      bodySource: "none",
    });
  }

  throwIfAborted(signal);

  const navigate =
    dependencies.navigateGoogle ??
    ((targetUrl, targetSignal) =>
      navigateGoogleRssUrl(targetUrl, targetSignal, {
        sessionManager: dependencies.sessionManager ?? new NavigationSessionManager(config),
        config,
      }));
  const googleResult = await navigate(url, signal);

  if (googleResult.status === "fail") {
    return createFailureResult(article, {
      googleRssUrl: url,
      failureType: googleResult.failureType,
      details: googleResult.details,
      extractionSource: "none",
      bodySource: "none",
    });
  }

  const googleClassification = classifyGooglePage(googleResult.finalUrl, googleResult.html);

  if (googleClassification.status === "blocked") {
    return createFailureResult(article, {
      googleRssUrl: url,
      googleFinalUrl: googleResult.finalUrl,
      googleStatusCode: googleResult.statusCode,
      failureType: "blocked_google",
      details: googleClassification.details,
      extractionSource: "none",
      bodySource: "google-page",
    });
  }

  const extraction = (dependencies.extractPublisher ?? extractPublisherUrl)({
    finalUrl: googleResult.finalUrl,
    html: googleResult.html,
  });

  if (!extraction.publisherUrl) {
    return createFailureResult(article, {
      googleRssUrl: url,
      googleFinalUrl: googleResult.finalUrl,
      googleStatusCode: googleResult.statusCode,
      failureType: "no_publisher_url_found",
      details: "No publisher URL was found on the Google page.",
      extractionSource: extraction.extractionSource,
      bodySource: "google-page",
    });
  }

  const fetchPublisher =
    dependencies.fetchPublisher ??
    ((publisherUrl, targetSignal) =>
      fetchPublisherArticle(publisherUrl, targetSignal, {
        sessionManager: dependencies.sessionManager ?? new NavigationSessionManager(config),
        config,
      }));
  const publisherResult = await fetchPublisher(extraction.publisherUrl, signal);

  if (publisherResult.status === "fail") {
    return createFailureResult(article, {
      googleRssUrl: url,
      googleFinalUrl: googleResult.finalUrl,
      publisherUrl: extraction.publisherUrl,
      googleStatusCode: googleResult.statusCode,
      publisherStatusCode: publisherResult.statusCode,
      failureType: publisherResult.failureType,
      details: publisherResult.details,
      extractionSource: extraction.extractionSource,
      bodySource: "none",
    });
  }

  const parsedArticle = (dependencies.parseArticle ?? parseArticleHtml)(publisherResult.html);

  if (parsedArticle.status === "fail") {
    return createFailureResult(article, {
      googleRssUrl: url,
      googleFinalUrl: googleResult.finalUrl,
      publisherUrl: extraction.publisherUrl,
      publisherFinalUrl: publisherResult.finalUrl,
      title: parsedArticle.title,
      content: parsedArticle.content,
      googleStatusCode: googleResult.statusCode,
      publisherStatusCode: publisherResult.statusCode,
      failureType: parsedArticle.failureType ?? "short_content",
      details: parsedArticle.details ?? "Parsed article content was too short.",
      extractionSource: extraction.extractionSource,
      bodySource: publisherResult.bodySource,
    });
  }

  logInfo("article scrape succeeded", {
    articleId: article.id,
    bodySource: publisherResult.bodySource,
    extractionSource: extraction.extractionSource,
    googleStatusCode: googleResult.statusCode,
    publisherStatusCode: publisherResult.statusCode,
  });

  return {
    articleId: article.id,
    googleRssUrl: url,
    googleFinalUrl: googleResult.finalUrl,
    publisherUrl: extraction.publisherUrl,
    publisherFinalUrl: publisherResult.finalUrl,
    title: parsedArticle.title ?? article.title,
    content: parsedArticle.content,
    status: "success",
    extractionSource: extraction.extractionSource,
    bodySource: publisherResult.bodySource,
    googleStatusCode: googleResult.statusCode,
    publisherStatusCode: publisherResult.statusCode,
    resolvedUrl: publisherResult.finalUrl,
  };
}

export async function processArticleWithTimeout(
  article: ScrapeArticleInput,
  signal: AbortSignal,
  processArticle: ScrapeProcessor,
  timeoutMs: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([processArticle(article, signal), timeoutPromise]);

    if (result === "timeout") {
      return createFailureResult(article, {
        googleRssUrl: article.link ?? article.url,
        failureType: "navigation_error",
        details: "Article scrape timed out.",
        extractionSource: "none",
        bodySource: "none",
      });
    }

    return result;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createEmptyScrapeSummary(): ScrapeSummary {
  return {
    considered: 0,
    skipped: 0,
    success: 0,
    failed: 0,
  };
}

export function summarizeScrapeResults(results: ScrapeResult[]): ScrapeSummary {
  const skipped = results.filter(
    (result) => result.failureType === "no_publisher_url_found" && !result.googleRssUrl,
  ).length;
  const success = results.filter((result) => result.status === "success").length;

  return {
    considered: results.length,
    skipped,
    success,
    failed: results.length - skipped - success,
  };
}

function createFailureResult(
  article: ScrapeArticleInput,
  result: Omit<ScrapeResult, "articleId" | "status">,
): ScrapeResult {
  logWarn("article scrape failed", {
    articleId: article.id,
    failureType: result.failureType,
    details: result.details,
    bodySource: result.bodySource,
    extractionSource: result.extractionSource,
    googleStatusCode: result.googleStatusCode,
    publisherStatusCode: result.publisherStatusCode,
  });

  return {
    articleId: article.id,
    status: "fail",
    ...result,
  };
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error("Job cancelled.");
  }
}
