"use client";

import { Info, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

const DEMO_INFO_SEEN_KEY = "news-nexus-lite-demo-info-seen";
const NEWS_NEXUS_VIDEO_URL = "https://www.youtube.com/watch?v=dxFSxkwByWs";

export function DemoInfoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    let animationFrame = 0;

    try {
      if (window.localStorage.getItem(DEMO_INFO_SEEN_KEY) === "true") {
        return;
      }

      window.localStorage.setItem(DEMO_INFO_SEEN_KEY, "true");
      animationFrame = window.requestAnimationFrame(() => setIsOpen(true));
    } catch {
      animationFrame = window.requestAnimationFrame(() => setIsOpen(true));
    }

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="About this demo"
        title="About this demo"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white text-gray-700 shadow-theme-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-4"
          role="presentation"
          onMouseDown={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-theme-md dark:border-gray-800 dark:bg-gray-950"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="text-base font-semibold text-gray-900 dark:text-white"
                >
                  News Nexus Lite demo
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close demo information"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <p
                id={descriptionId}
                className="text-sm leading-6 text-gray-700 dark:text-gray-200"
              >
                This demo version features an article approval process using
                automated AI workflows.
              </p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/25"
              >
                Try demo
              </button>
              <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                Watch the{" "}
                <a
                  href={NEWS_NEXUS_VIDEO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-gray-600 underline underline-offset-2 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-300"
                >
                  2 minute video
                </a>{" "}
                on the full News Nexus architecture.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
