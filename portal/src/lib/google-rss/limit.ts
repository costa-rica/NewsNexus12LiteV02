const DEFAULT_ARTICLE_LIMIT = 10;

export function resolveArticleLimit() {
  const rawLimit = process.env.ARTICLE_LIMIT_GOOGLE_RSS_SEARCH;
  const parsedLimit = Number.parseInt(rawLimit ?? "", 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_ARTICLE_LIMIT;
  }

  return parsedLimit;
}

export function applyArticleLimit<T>(articles: T[], limit = resolveArticleLimit()) {
  return articles.slice(0, limit);
}
