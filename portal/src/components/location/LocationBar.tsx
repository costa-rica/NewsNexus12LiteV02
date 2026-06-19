"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import { pollJob, WorkerRequestError } from "@/lib/worker/jobClient";
import {
  type LocationJob,
  type LocationResults,
  startLocationJob,
} from "@/lib/worker/locationClient";
import { applyLocationRatings, setLocationRun } from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";
import type { LocationRunStatus, LocationRunSummary } from "@/state/types";

type LocationBarStatus =
  | { type: "idle" }
  | { type: "warning"; message: string }
  | { type: "error"; message: string };

const EMPTY_SUMMARY: LocationRunSummary = {
  eligible: 0,
  processed: 0,
  skipped: 0,
  modelLoading: 0,
};

export function LocationBar() {
  const { state, dispatch } = useFlow();
  const [status, setStatus] = useState<LocationBarStatus>({ type: "idle" });
  const run = state.locationRun;
  const isRunning = run?.status === "running";
  const isLoadingModel = isRunning && run?.summary.modelLoading === 1;

  const handleRate = async () => {
    if (state.articles.length === 0) {
      setStatus({
        type: "warning",
        message: "Search for articles before rating.",
      });
      return;
    }

    setStatus({ type: "idle" });
    dispatch(
      setLocationRun({
        status: "running",
        processed: 0,
        total: state.articles.length,
        summary: EMPTY_SUMMARY,
      }),
    );

    try {
      const startResponse = await startLocationJob(state.articles);
      const terminalJob = await pollJob<LocationResults, LocationRunSummary>(
        startResponse.jobId,
        {
          onUpdate: (job) => dispatch(setLocationRun(toLocationRunStatus(job))),
        },
      );

      dispatch(setLocationRun(toLocationRunStatus(terminalJob)));

      if (terminalJob.status === "completed" && terminalJob.results) {
        dispatch(
          applyLocationRatings(
            terminalJob.results.scores,
            terminalJob.results.skippedIds,
          ),
        );

        if (terminalJob.summary.processed === 0) {
          setStatus({
            type: "warning",
            message: "No articles had usable text to rate.",
          });
        }
      }
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof WorkerRequestError
            ? error.message
            : "Rating request failed. Please try again.",
      });
      dispatch(
        setLocationRun({
          status: "failed",
          processed: run?.processed ?? 0,
          total: state.articles.length,
          summary: run?.summary ?? EMPTY_SUMMARY,
        }),
      );
    }
  };

  const progressLabel = run
    ? isLoadingModel
      ? "Loading model…"
      : `${run.summary.processed}/${run.summary.eligible} classified`
    : `${state.articles.length} article${
        state.articles.length === 1 ? "" : "s"
      } ready`;

  return (
    <section
      className="stage-aligned-region pb-4"
      aria-label="Nexus location rating"
    >
      <div className="rounded-lg border border-gray-200/80 bg-white/75 p-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              Nexus location rating
            </div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {progressLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRate}
            disabled={isRunning || state.articles.length === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
          >
            <MapPin aria-hidden="true" className="h-4 w-4" />
            <span>{isRunning ? "Rating" : "Start Rating"}</span>
          </button>
        </div>

        {run && (
          <div
            role="status"
            className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-200 sm:grid-cols-3"
          >
            <span>Eligible {run.summary.eligible}</span>
            <span>Classified {run.summary.processed}</span>
            <span>Skipped {run.summary.skipped}</span>
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
    </section>
  );
}

function toLocationRunStatus(job: LocationJob): LocationRunStatus {
  return {
    status: job.status === "queued" ? "running" : job.status,
    processed: job.processed,
    total: job.total,
    summary: job.summary,
  };
}
