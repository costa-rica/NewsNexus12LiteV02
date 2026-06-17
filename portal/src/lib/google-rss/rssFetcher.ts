import type { GoogleRssErrorCode } from "./types";

const RSS_REQUEST_TIMEOUT_MS = 20_000;

export type FetchGoogleRssResult =
  | { status: "success"; xml: string }
  | { status: "error"; errorCode: GoogleRssErrorCode; error: string };

export async function fetchGoogleRss(
  url: string,
): Promise<FetchGoogleRssResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RSS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NewsNexus12API/1.0",
      },
    });

    if (!response.ok) {
      return {
        status: "error",
        errorCode:
          response.status === 503 ? "rate_limited" : "request_failed",
        error: `RSS request failed with status ${response.status}`,
      };
    }

    return {
      status: "success",
      xml: await response.text(),
    };
  } catch (error) {
    return {
      status: "error",
      errorCode: "request_failed",
      error: error instanceof Error ? error.message : "RSS request failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
