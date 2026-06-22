// Permanent Lite copy of the 25 default keywords from the source workbook's
// first worksheet (Keywords), column A, excluding the header row.
export const defaultSemanticKeywords = [
  "consumer product safety",
  "cpsc safety alert",
  "hazardous product warning",
  "defective product injury",
  "product-related accident",
  "home safety hazards",
  "home safety",
  "child injury product",
  "fire hazard consumer product",
  "electric shock incident",
  "poisoning household product",
  "carbon monoxide poisoning product",
  "burn injury consumer product",
  "burn injury",
  "choking hazard",
  "laceration product defect",
  "mechanical failure injury",
  "mechanical injury",
  "electrical appliance fire",
  "sports equipment injury",
  "toxic household chemicals",
  "playground equipment accident",
  "electrical fire",
  "playground accident",
  "toxic chemical",
];

export const defaultSemanticKeywordDraft = defaultSemanticKeywords.join("\n");

export function parseSemanticKeywords(draft: string) {
  return draft
    .split(/\r?\n/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}
