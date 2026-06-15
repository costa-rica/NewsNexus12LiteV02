import * as cheerio from "cheerio";

import { loadArticleContentConfig } from "./config.js";
import type { ParsedArticle } from "./types.js";
import { normalizeText } from "./urlUtils.js";

interface ParseArticleHtmlOptions {
  contentMinLength?: number;
  paragraphMinLength?: number;
}

export function parseArticleHtml(
  html: string,
  options: ParseArticleHtmlOptions = {},
): ParsedArticle {
  const config = loadArticleContentConfig();
  const contentMinLength = options.contentMinLength ?? config.contentMinLength;
  const paragraphMinLength = options.paragraphMinLength ?? config.paragraphMinLength;
  const $ = cheerio.load(html);

  $("script, style, noscript, nav, header, footer, svg").remove();

  const title =
    normalizeText($("meta[property='og:title']").first().attr("content") ?? "") ||
    normalizeText($("h1").first().text()) ||
    normalizeText($("title").first().text());

  const paragraphs = $("p")
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .filter((text) => text.length >= paragraphMinLength);

  const content = paragraphs.length > 0 ? paragraphs.join("\n\n") : normalizeText($("body").text());

  if (content.length < contentMinLength) {
    return {
      status: "fail",
      title,
      content,
      failureType: "short_content",
      details: "Parsed article content was shorter than the minimum length.",
    };
  }

  return {
    status: "success",
    title,
    content,
  };
}
