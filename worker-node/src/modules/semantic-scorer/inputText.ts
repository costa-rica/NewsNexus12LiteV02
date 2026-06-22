import type { SemanticArticleInput } from "./types.js";

export function pickArticleText(article: SemanticArticleInput) {
  const scrapedContent =
    article.scrape?.status === "success" ? article.scrape.content?.trim() : "";
  const description = article.description?.trim();
  const title = article.title?.trim();

  return scrapedContent || description || title || "";
}
