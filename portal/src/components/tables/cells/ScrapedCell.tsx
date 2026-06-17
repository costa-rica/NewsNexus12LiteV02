"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import type { ScrapeResult } from "@/state/types";

import { ScrapeModal } from "./ScrapeModal";

export interface ScrapedCellProps {
  scrape?: ScrapeResult;
  onOpen?: (scrape: ScrapeResult) => void;
}

export function ScrapedCell({ scrape, onOpen }: ScrapedCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasUsableScrape =
    scrape?.status === "success" && (scrape.content?.length ?? 0) >= 200;

  if (!scrape || !hasUsableScrape) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open scraped article"
        onClick={() => {
          setIsOpen(true);
          onOpen?.(scrape);
        }}
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100 dark:border-green-900/50 dark:bg-green-900/30 dark:text-green-300"
      >
        <Check aria-hidden="true" className="h-4 w-4" />
      </button>
      {isOpen && (
        <ScrapeModal scrape={scrape} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
