export interface RatingCircleProps {
  score?: number | null;
  ariaLabel?: string;
}

export function normalizeRatingScore(score: number) {
  return Math.max(0, Math.min(1, score));
}

export function getRatingCircleColor(score: number) {
  const normalized = normalizeRatingScore(score);
  const green = Math.floor(normalized * 200);
  const redAndBlue = Math.round(128 - green / 3);

  return `rgb(${redAndBlue}, ${green}, ${redAndBlue})`;
}

/**
 * Pure rating badge used by the location and semantic stages. Consumers pass a
 * normalized 0..1 score; undefined/null intentionally renders an empty cell.
 */
export function RatingCircle({ score, ariaLabel = "Rating" }: RatingCircleProps) {
  if (score === undefined || score === null) {
    return null;
  }

  const normalized = normalizeRatingScore(score);
  const percent = Math.round(normalized * 100);

  return (
    <div className="flex justify-center">
      <span
        aria-label={`${ariaLabel}: ${percent}%`}
        className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white shadow-theme-sm"
        style={{ backgroundColor: getRatingCircleColor(normalized) }}
      >
        {percent}%
      </span>
    </div>
  );
}
