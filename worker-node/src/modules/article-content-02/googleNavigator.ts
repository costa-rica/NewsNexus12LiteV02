import { type ArticleContentConfig, loadArticleContentConfig } from "./config.js";
import type { BrowserPageProvider } from "./navigationSessionManager.js";
import type { ScrapeFailureType } from "./types.js";

export type GoogleNavigationResult =
  | {
      status: "success";
      finalUrl: string;
      html: string;
      statusCode?: number;
    }
  | {
      status: "fail";
      failureType: Extract<ScrapeFailureType, "navigation_error">;
      details: string;
    };

interface NavigateGoogleOptions {
  sessionManager: BrowserPageProvider;
  config?: ArticleContentConfig;
}

const GOOGLE_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function navigateGoogleRssUrl(
  url: string,
  signal: AbortSignal,
  { sessionManager, config = loadArticleContentConfig() }: NavigateGoogleOptions,
): Promise<GoogleNavigationResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.googleNavigationRetries; attempt += 1) {
    if (signal.aborted) {
      throw new Error("Job cancelled.");
    }

    let page: Awaited<ReturnType<BrowserPageProvider["getPage"]>> | undefined;

    try {
      page = await sessionManager.getPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.setExtraHTTPHeaders(GOOGLE_HEADERS);

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: config.googleNavigationTimeoutMs,
      });
      await page.waitForTimeout(config.googlePostLoadWaitMs);

      return {
        status: "success",
        finalUrl: page.url(),
        html: await page.content(),
        statusCode: response?.status(),
      };
    } catch (error) {
      lastError = error;
      await sessionManager.recordNavigationError();
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  return {
    status: "fail",
    failureType: "navigation_error",
    details: lastError instanceof Error ? lastError.message : "Google navigation failed.",
  };
}
