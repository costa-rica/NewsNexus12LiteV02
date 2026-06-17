"use client";

import { FileSearch } from "lucide-react";
import { useState } from "react";

import { LoadingDots } from "@/components/common/LoadingDots";
import { pollJob, WorkerRequestError } from "@/lib/worker/jobClient";
import { startScrapeJob, type ScrapeJob } from "@/lib/worker/scrapeClient";
import {
  applyScrapeResults,
  setScrapeRun,
} from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";
import type {
  ScrapeResult,
  ScrapeRunStatus,
  ScrapeRunSummary,
} from "@/state/types";

type ScrapeBarStatus =
  | { type: "idle" }
  | { type: "warning"; message: string }
  | { type: "error"; message: string };

const EMPTY_SUMMARY: ScrapeRunSummary = {
  considered: 0,
  skipped: 0,
  success: 0,
  failed: 0,
};

export function ScrapeBar() {
  const { state, dispatch } = useFlow();
  const [status, setStatus] = useState<ScrapeBarStatus>({ type: "idle" });
  const isRunning = state.scrapeRun?.status === "running";
  const run = state.scrapeRun;

  const handleScrape = async () => {
    if (state.articles.length === 0) {
      setStatus({
        type: "warning",
        message: "Search for articles before scraping.",
      });
      return;
    }

    setStatus({ type: "idle" });
    dispatch(
      setScrapeRun({
        status: "running",
        processed: 0,
        total: state.articles.length,
        summary: EMPTY_SUMMARY,
      }),
    );

    try {
      const startResponse = await startScrapeJob(state.articles);
      const terminalJob = await pollJob<ScrapeResult[], ScrapeRunSummary>(
        startResponse.jobId,
        {
          onUpdate: (job) => {
            dispatch(setScrapeRun(toScrapeRunStatus(job)));

            if (job.results?.length) {
              dispatch(applyScrapeResults(job.results));
            }
          },
        },
      );

      dispatch(setScrapeRun(toScrapeRunStatus(terminalJob)));

      if (terminalJob.results?.length) {
        dispatch(applyScrapeResults(terminalJob.results));
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: getScrapeErrorMessage(error),
      });
      dispatch(
        setScrapeRun({
          status: "failed",
          processed: run?.processed ?? 0,
          total: state.articles.length,
          summary: run?.summary ?? EMPTY_SUMMARY,
        }),
      );
    }
  };

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8"
      aria-label="Article scrape"
    >
      <div className="rounded-lg border border-gray-200/80 bg-white/75 p-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              Article content scrape
            </div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {run
                ? `${run.processed}/${run.total} processed`
                : `${state.articles.length} article${
                    state.articles.length === 1 ? "" : "s"
                  } ready`}
            </div>
          </div>
          <button
            type="button"
            onClick={handleScrape}
            disabled={isRunning || state.articles.length === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
          >
            <FileSearch aria-hidden="true" className="h-4 w-4" />
            <span>{isRunning ? "Scraping" : "Scrape"}</span>
          </button>
        </div>

        {run && (
          <div
            role="status"
            className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-200 sm:grid-cols-4"
          >
            <span>Considered {run.summary.considered}</span>
            <span>Skipped {run.summary.skipped}</span>
            <span>Success {run.summary.success}</span>
            <span>Failed {run.summary.failed}</span>
          </div>
        )}

        {status.type !== "idle" && (
          <div
            role="alert"
            className={[
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              status.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200",
            ].join(" ")}
          >
            {status.message}
          </div>
        )}
      </div>

      {isRunning && run && <ScrapeProgressDialog run={run} />}
    </section>
  );
}

function ScrapeProgressDialog({ run }: { run: ScrapeRunStatus }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scraping articles"
        aria-live="polite"
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-6 py-7 text-center shadow-theme-md dark:border-gray-800 dark:bg-gray-950"
      >
        <LoadingDots className="mb-6" size={3} />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Scraping articles
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {run.processed}/{run.total} processed
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-left text-sm text-gray-700 dark:text-gray-200">
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Success {run.summary.success}
          </span>
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Failed {run.summary.failed}
          </span>
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Skipped {run.summary.skipped}
          </span>
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Total {run.summary.considered}
          </span>
        </div>
      </div>
    </div>
  );
}

function getScrapeErrorMessage(error: unknown) {
  if (error instanceof WorkerRequestError) {
    return error.message;
  }

  return "Scrape request failed. Please try again.";
}

function toScrapeRunStatus(job: ScrapeJob): ScrapeRunStatus {
  return {
    status: job.status === "queued" ? "running" : job.status,
    processed: job.processed,
    total: job.total,
    summary: job.summary,
  };
}
