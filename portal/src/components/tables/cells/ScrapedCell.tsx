import { Check } from "lucide-react";

import type { ScrapeResult } from "@/state/types";

export interface ScrapedCellProps {
  scrape?: ScrapeResult;
  onOpen?: (scrape: ScrapeResult) => void;
}

/**
 * Stage 3 hook point. An absent scrape result renders empty; a provided result
 * displays the check-mark trigger that will open scrape detail UI later.
 */
export function ScrapedCell({ scrape, onOpen }: ScrapedCellProps) {
  if (!scrape) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="Open scraped article"
      onClick={() => onOpen?.(scrape)}
      className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100 dark:border-green-900/50 dark:bg-green-900/30 dark:text-green-300"
    >
      <Check aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
