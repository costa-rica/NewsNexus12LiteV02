import type { GoogleRssCriteria } from "./types";

const DEFAULT_TIME_RANGE = "7d";

function splitCsv(value: string) {
  return value
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function normalizeTerm(term: string) {
  const hasMatchingQuotes =
    (term.startsWith('"') && term.endsWith('"')) ||
    (term.startsWith("'") && term.endsWith("'"));

  if (hasMatchingQuotes) {
    return term;
  }

  if (term.includes(" ")) {
    return `"${term}"`;
  }

  return term;
}

function normalizeTimeRange(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_TIME_RANGE;
}

export function buildGoogleRssQuery(criteria: GoogleRssCriteria) {
  const andTerms = splitCsv(criteria.and_keywords).map(normalizeTerm);
  const timeRange = normalizeTimeRange(criteria.time_range);

  return [...andTerms, `when:${timeRange}`].join(" ").trim();
}
