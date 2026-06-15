export interface ArticleContentConfig {
  articleTimeoutMs: number;
  browserRecycleAttempts: number;
  browserRecycleNavigationErrors: number;
  googleNavigationTimeoutMs: number;
  googlePostLoadWaitMs: number;
  googleNavigationRetries: number;
  publisherNavigationTimeoutMs: number;
  publisherPostLoadWaitMs: number;
  publisherFetchRetries: number;
  contentMinLength: number;
  paragraphMinLength: number;
  incompleteHtmlLength: number;
}

const DEFAULT_ARTICLE_TIMEOUT_MS = 90_000;
const MIN_ARTICLE_TIMEOUT_MS = 10_000;
const DEFAULT_BROWSER_RECYCLE_ATTEMPTS = 25;
const DEFAULT_BROWSER_RECYCLE_NAVIGATION_ERRORS = 3;

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum = 1,
) {
  const rawValue = env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(value, minimum);
}

export function loadArticleContentConfig(env: NodeJS.ProcessEnv = process.env): ArticleContentConfig {
  return {
    articleTimeoutMs: readPositiveInt(
      env,
      "ARTICLE_CONTENT_02_ARTICLE_TIMEOUT_MS",
      DEFAULT_ARTICLE_TIMEOUT_MS,
      MIN_ARTICLE_TIMEOUT_MS,
    ),
    browserRecycleAttempts: readPositiveInt(
      env,
      "ARTICLE_CONTENT_02_BROWSER_RECYCLE_ATTEMPTS",
      DEFAULT_BROWSER_RECYCLE_ATTEMPTS,
    ),
    browserRecycleNavigationErrors: readPositiveInt(
      env,
      "ARTICLE_CONTENT_02_BROWSER_RECYCLE_NAVIGATION_ERRORS",
      DEFAULT_BROWSER_RECYCLE_NAVIGATION_ERRORS,
    ),
    googleNavigationTimeoutMs: 30_000,
    googlePostLoadWaitMs: 5_000,
    googleNavigationRetries: 2,
    publisherNavigationTimeoutMs: 20_000,
    publisherPostLoadWaitMs: 2_500,
    publisherFetchRetries: 2,
    contentMinLength: 200,
    paragraphMinLength: 20,
    incompleteHtmlLength: 500,
  };
}
