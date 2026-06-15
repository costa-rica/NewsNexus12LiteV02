import type { Article } from "@/state/types";

import type { ParsedRssArticle } from "./types";

export function assignArticleIds(items: ParsedRssArticle[]): Article[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    ...item,
  }));
}
