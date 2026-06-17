import { type ArticleContentConfig, loadArticleContentConfig } from "./config.js";
import type { BrowserPageProvider } from "./navigationSessionManager.js";
import { classifyPublisherResponse } from "./publisherClassifier.js";
import type { ScrapeBodySource, ScrapeFailureType } from "./types.js";

export type PublisherFetchResult =
  | {
      status: "success";
      finalUrl: string;
      html: string;
      statusCode?: number;
      bodySource: Extract<ScrapeBodySource, "direct-http" | "playwright-publisher">;
    }
  | {
      status: "fail";
      failureType: Extract<
        ScrapeFailureType,
        "blocked_publisher" | "publisher_fetch_error"
      >;
      details: string;
      statusCode?: number;
    };

interface FetchPublisherOptions {
  sessionManager: BrowserPageProvider;
  config?: ArticleContentConfig;
  fetchFn?: typeof fetch;
}

const PUBLISHER_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

export async function fetchPublisherArticle(
  publisherUrl: string,
  signal: AbortSignal,
  {
    sessionManager,
    config = loadArticleContentConfig(),
    fetchFn = fetch,
  }: FetchPublisherOptions,
): Promise<PublisherFetchResult> {
  let incompleteResult:
    | {
        html: string;
        finalUrl: string;
        statusCode?: number;
        details: string;
      }
    | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.publisherFetchRetries; attempt += 1) {
    if (signal.aborted) {
      throw new Error("Job cancelled.");
    }

    try {
      const response = await fetchFn(publisherUrl, {
        headers: PUBLISHER_HEADERS,
        redirect: "follow",
        signal,
      });
      const html = await response.text();
      const classification = classifyPublisherResponse({
        html,
        statusCode: response.status,
        incompleteHtmlLength: config.incompleteHtmlLength,
      });

      if (classification.status === "usable") {
        return {
          status: "success",
          finalUrl: response.url || publisherUrl,
          html,
          statusCode: response.status,
          bodySource: "direct-http",
        };
      }

      if (classification.status === "blocked") {
        return {
          status: "fail",
          failureType: "blocked_publisher",
          details: classification.details,
          statusCode: response.status,
        };
      }

      incompleteResult = {
        html,
        finalUrl: response.url || publisherUrl,
        statusCode: response.status,
        details: classification.details,
      };
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!incompleteResult && lastError) {
    return {
      status: "fail",
      failureType: "publisher_fetch_error",
      details: lastError instanceof Error ? lastError.message : "Publisher fetch failed.",
    };
  }

  return fetchPublisherWithPlaywright(publisherUrl, signal, {
    sessionManager,
    config,
    fallbackStatusCode: incompleteResult?.statusCode,
    fallbackDetails: incompleteResult?.details,
  });
}

async function fetchPublisherWithPlaywright(
  publisherUrl: string,
  signal: AbortSignal,
  {
    sessionManager,
    config,
    fallbackStatusCode,
    fallbackDetails,
  }: {
    sessionManager: BrowserPageProvider;
    config: ArticleContentConfig;
    fallbackStatusCode?: number;
    fallbackDetails?: string;
  },
): Promise<PublisherFetchResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.publisherFetchRetries; attempt += 1) {
    if (signal.aborted) {
      throw new Error("Job cancelled.");
    }

    let page: Awaited<ReturnType<BrowserPageProvider["getPage"]>> | undefined;

    try {
      page = await sessionManager.getPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.setExtraHTTPHeaders(PUBLISHER_HEADERS);

      const response = await page.goto(publisherUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.publisherNavigationTimeoutMs,
      });
      await page.waitForTimeout(config.publisherPostLoadWaitMs);

      const html = await page.content();
      const statusCode = response?.status() ?? fallbackStatusCode;
      const classification = classifyPublisherResponse({
        html,
        statusCode,
        incompleteHtmlLength: config.incompleteHtmlLength,
      });

      if (classification.status === "usable") {
        return {
          status: "success",
          finalUrl: page.url(),
          html,
          statusCode,
          bodySource: "playwright-publisher",
        };
      }

      if (classification.status === "blocked") {
        return {
          status: "fail",
          failureType: "blocked_publisher",
          details: classification.details,
          statusCode,
        };
      }

      lastError = new Error(classification.details);
    } catch (error) {
      lastError = error;
      await sessionManager.recordNavigationError();
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  return {
    status: "fail",
    failureType: "publisher_fetch_error",
    details:
      fallbackDetails ??
      (lastError instanceof Error ? lastError.message : "Publisher browser fetch failed."),
    statusCode: fallbackStatusCode,
  };
}
