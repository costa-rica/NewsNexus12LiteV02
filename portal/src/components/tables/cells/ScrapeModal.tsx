"use client";

import { X } from "lucide-react";

import type { ScrapeResult } from "@/state/types";

interface ScrapeModalProps {
  scrape: ScrapeResult;
  onClose: () => void;
}

export function ScrapeModal({ scrape, onClose }: ScrapeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scraped article content"
        className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {scrape.title || "Scraped article"}
            </h2>
            {scrape.publisherUrl && (
              <a
                href={scrape.publisherUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                {scrape.publisherUrl}
              </a>
            )}
          </div>
          <button
            type="button"
            aria-label="Close scraped article"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(86vh-84px)] overflow-y-auto px-5 py-4">
          <dl className="grid gap-3 text-sm text-gray-700 dark:text-gray-200 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-gray-900 dark:text-white">
                Body source
              </dt>
              <dd className="mt-1">{scrape.bodySource ?? "none"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900 dark:text-white">
                Extraction source
              </dt>
              <dd className="mt-1">{scrape.extractionSource ?? "none"}</dd>
            </div>
          </dl>
          <div className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-100">
            {scrape.content}
          </div>
        </div>
      </div>
    </div>
  );
}
