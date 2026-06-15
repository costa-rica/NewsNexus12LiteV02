import { normalizeText } from "./urlUtils.js";

export type PublisherClassification =
  | { status: "usable" }
  | { status: "blocked"; details: string }
  | { status: "incomplete"; details: string };

const BLOCKED_PATTERNS = [
  /access denied/i,
  /are you a human/i,
  /verify you are human/i,
  /checking your browser/i,
  /cloudflare/i,
  /captcha/i,
  /blocked by/i,
  /temporarily unavailable due to automated/i,
];

const INCOMPLETE_PATTERNS = [
  /enable javascript/i,
  /please enable cookies/i,
  /cookie wall/i,
  /javascript is required/i,
  /subscribe to continue/i,
];

interface ClassifyPublisherResponseInput {
  html: string;
  statusCode?: number;
  incompleteHtmlLength?: number;
}

export function classifyPublisherResponse({
  html,
  statusCode,
  incompleteHtmlLength = 500,
}: ClassifyPublisherResponseInput): PublisherClassification {
  const text = normalizeText(html);

  if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
    return {
      status: "blocked",
      details: `Publisher returned HTTP ${statusCode}.`,
    };
  }

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      status: "blocked",
      details: "Publisher page matched an anti-bot or blocked-access pattern.",
    };
  }

  if (html.length < incompleteHtmlLength || INCOMPLETE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      status: "incomplete",
      details: "Publisher HTML was incomplete or required JavaScript/cookies.",
    };
  }

  return { status: "usable" };
}
