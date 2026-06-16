"use client";

import { RotateCcw, Search } from "lucide-react";
import { type FormEvent, useState } from "react";

import { resetFlow, setArticles } from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";
import type { Article } from "@/state/types";

type SearchStatus =
  | { type: "idle" }
  | { type: "warning"; message: string }
  | { type: "success"; message: string; url?: string }
  | { type: "error"; message: string };

interface GoogleRssClientResponse {
  url?: string;
  articlesArray?: Article[];
  count?: number;
  error?: { code: string; message: string; status: number };
}

export function SearchBar() {
  const { dispatch } = useFlow();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<SearchStatus>({ type: "idle" });

  const handleReset = () => {
    setQuery("");
    setStatus({ type: "idle" });
    dispatch(resetFlow());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setStatus({
        type: "warning",
        message: "Enter a search query.",
      });
      return;
    }

    setIsLoading(true);
    setStatus({ type: "idle" });

    try {
      const response = await fetch("/api/google-rss/make-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          and_keywords: trimmedQuery,
          and_exact_phrases: "",
          or_keywords: "",
          or_exact_phrases: "",
          time_range: "7d",
        }),
      });
      const data = (await response.json()) as GoogleRssClientResponse;

      if (!response.ok) {
        setStatus({
          type: "error",
          message: data.error?.message ?? "Request failed. Please try again.",
        });
        return;
      }

      const articles = data.articlesArray ?? [];
      dispatch(setArticles(articles));

      setStatus({
        type: "success",
        message:
          articles.length === 0
            ? "No articles found for this query."
            : `Fetched ${data.count ?? articles.length} article${
                (data.count ?? articles.length) === 1 ? "" : "s"
              }.`,
        url: data.url,
      });
    } catch {
      setStatus({
        type: "error",
        message: "Request failed. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8"
      aria-label="Google RSS search"
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200/80 bg-white/75 p-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span className="mb-2 block">Google RSS query</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-theme-sm outline-none transition-colors placeholder:text-gray-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
              placeholder="fire"
            />
          </label>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
            <span>{isLoading ? "Searching" : "Search"}</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-theme-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            <span>Reset</span>
          </button>
        </div>

        {status.type !== "idle" && (
          <div
            role={status.type === "error" || status.type === "warning" ? "alert" : "status"}
            className={[
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              status.type === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-900/20 dark:text-green-200"
                : "",
              status.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
                : "",
              status.type === "error"
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200"
                : "",
            ].join(" ")}
          >
            <p>{status.message}</p>
            {status.type === "success" && status.url && (
              <a
                href={status.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                {status.url}
              </a>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
