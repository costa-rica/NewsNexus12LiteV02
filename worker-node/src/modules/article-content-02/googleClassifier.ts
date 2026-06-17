import { isGoogleOwnedUrl, normalizeText } from "./urlUtils.js";

export type GoogleClassification =
  | { status: "ok" }
  | { status: "blocked"; details: string };

const BLOCKED_PATTERNS = [
  /consent\.google/i,
  /before you continue/i,
  /unusual traffic/i,
  /our systems have detected/i,
  /detected unusual traffic/i,
  /captcha/i,
  /sorry\/index/i,
  /enable javascript/i,
  /automated queries/i,
];

const NEWS_SHELL_PATTERNS = [
  /<title>\s*google news\s*<\/title>/i,
  /aria-label=["']google news["']/i,
  /top stories/i,
];

export function classifyGooglePage(finalUrl: string, html: string): GoogleClassification {
  const pageText = normalizeText(html);

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(finalUrl) || pattern.test(pageText))) {
    return {
      status: "blocked",
      details: "Google returned a consent, captcha, or anti-bot page.",
    };
  }

  const finalUrlIsGoogle = isGoogleOwnedUrl(finalUrl);
  const looksLikeNewsShell = NEWS_SHELL_PATTERNS.some((pattern) => pattern.test(html));

  if (finalUrlIsGoogle && looksLikeNewsShell) {
    return {
      status: "blocked",
      details: "Google returned a generic News shell instead of a publisher article.",
    };
  }

  return { status: "ok" };
}
