import type { LocationArticleInput } from "./types.js";

export interface ClassifierInput {
  text: string;
  eligible: boolean;
}

/**
 * Best available article body, mirroring the PRD precedence:
 * successful scraped content -> description -> RSS content.
 */
function bestBodyText(article: LocationArticleInput): string {
  if (article.scrape?.status === "success" && article.scrape.content?.trim()) {
    return article.scrape.content.trim();
  }
  if (article.description?.trim()) {
    return article.description.trim();
  }
  if (article.content?.trim()) {
    return article.content.trim();
  }
  return "";
}

/**
 * Assemble the zero-shot input as "<title>\n\n<best body>". Eligible only when
 * at least one of title/body is non-empty after trimming.
 */
export function buildClassifierInput(
  article: LocationArticleInput,
): ClassifierInput {
  const title = article.title?.trim() ?? "";
  const body = bestBodyText(article);

  if (!title && !body) {
    return { text: "", eligible: false };
  }

  const text = [title, body].filter((part) => part.length > 0).join("\n\n");
  return { text, eligible: true };
}
