"use client";

import { BrainCircuit } from "lucide-react";
import { useState } from "react";

import { LoadingDots } from "@/components/common/LoadingDots";
import {
  defaultSemanticKeywordDraft,
  parseSemanticKeywords,
} from "@/lib/semantic-scorer/defaultKeywords";
import { pollJob, WorkerRequestError } from "@/lib/worker/jobClient";
import {
  startSemanticJob,
  type SemanticJob,
  type SemanticResults,
} from "@/lib/worker/semanticClient";
import {
  applySemanticRatings,
  setSemanticRun,
} from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";
import type { SemanticRunStatus, SemanticRunSummary } from "@/state/types";

type SemanticBarStatus =
  | { type: "idle" }
  | { type: "warning"; message: string }
  | { type: "error"; message: string };

const EMPTY_SUMMARY: SemanticRunSummary = {
  eligible: 0,
  processed: 0,
  skipped: 0,
  failed: 0,
  modelLoading: 0,
};

export function SemanticBar() {
  const { state, dispatch } = useFlow();
  const [status, setStatus] = useState<SemanticBarStatus>({ type: "idle" });
  const run = state.semanticRun;
  const isRunning = run?.status === "running";
  const hasCompletedRun = run?.status === "completed";
  const keywordDraft = state.semanticKeywordDraft ?? defaultSemanticKeywordDraft;

  const handleRate = async () => {
    if (hasCompletedRun) {
      return;
    }

    if (state.articles.length === 0) {
      setStatus({
        type: "warning",
        message: "Search for articles before rating.",
      });
      return;
    }

    const keywords = parseSemanticKeywords(keywordDraft);

    if (keywords.length === 0) {
      setStatus({
        type: "warning",
        message: "Add at least one semantic keyword before rating.",
      });
      return;
    }

    setStatus({ type: "idle" });
    dispatch(
      setSemanticRun({
        status: "running",
        processed: 0,
        total: state.articles.length,
        summary: EMPTY_SUMMARY,
        keywordsUsed: keywords,
      }),
    );

    try {
      const startResponse = await startSemanticJob(state.articles, keywords);
      const terminalJob = await pollJob<SemanticResults, SemanticRunSummary>(
        startResponse.jobId,
        {
          onUpdate: (job) =>
            dispatch(setSemanticRun(toSemanticRunStatus(job, keywords))),
        },
      );

      dispatch(setSemanticRun(toSemanticRunStatus(terminalJob, keywords)));

      if (terminalJob.status === "failed") {
        setStatus({
          type: "error",
          message: "Semantic rating job failed. Please try again.",
        });
        return;
      }

      if (terminalJob.status === "completed" && terminalJob.results) {
        dispatch(
          applySemanticRatings(
            terminalJob.results.scores,
            terminalJob.results.skippedIds,
            terminalJob.results.failures,
          ),
        );

        if (terminalJob.summary.processed === 0) {
          setStatus({
            type: "warning",
            message: "No articles produced a valid semantic rating.",
          });
        }
      }
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof WorkerRequestError
            ? error.message
            : "Semantic rating request failed. Please try again.",
      });
      dispatch(
        setSemanticRun({
          status: "failed",
          processed: run?.processed ?? 0,
          total: state.articles.length,
          summary: run?.summary ?? EMPTY_SUMMARY,
          keywordsUsed: keywords,
        }),
      );
    }
  };

  const isLoadingModel = isRunning && run?.summary.modelLoading === 1;
  const progressLabel = run
    ? isLoadingModel
      ? "Loading model..."
      : `${run.summary.processed}/${run.summary.eligible} rated`
    : `${state.articles.length} article${
        state.articles.length === 1 ? "" : "s"
      } ready`;

  return (
    <section
      className="stage-aligned-region pb-4"
      aria-label="Nexus semantic rating"
    >
      <div className="rounded-lg border border-gray-200/80 bg-white/75 p-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              Nexus semantic rating
            </div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {progressLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRate}
            disabled={isRunning || hasCompletedRun || state.articles.length === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
          >
            <BrainCircuit aria-hidden="true" className="h-4 w-4" />
            <span>{isRunning ? "Rating" : "Start Rating"}</span>
          </button>
        </div>

        {run && (
          <div
            role="status"
            className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-200 sm:grid-cols-4"
          >
            <span>Eligible {run.summary.eligible}</span>
            <span>Rated {run.summary.processed}</span>
            <span>Skipped {run.summary.skipped}</span>
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

      {isRunning && run && <SemanticProgressDialog run={run} />}
    </section>
  );
}

function SemanticProgressDialog({ run }: { run: SemanticRunStatus }) {
  const isLoadingModel = run.summary.modelLoading === 1;
  const title = isLoadingModel
    ? "Loading semantic model"
    : "Rating article semantics";
  const progressText = isLoadingModel
    ? "Preparing the AI embedder"
    : `${run.summary.processed}/${run.summary.eligible} rated`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rating article semantics"
        aria-live="polite"
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-6 py-7 text-center shadow-theme-md dark:border-gray-800 dark:bg-gray-950"
      >
        <LoadingDots className="mb-6" size={3} />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {progressText}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-left text-sm text-gray-700 dark:text-gray-200">
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Eligible {run.summary.eligible}
          </span>
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Rated {run.summary.processed}
          </span>
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Skipped {run.summary.skipped}
          </span>
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            Failed {run.summary.failed}
          </span>
        </div>
      </div>
    </div>
  );
}

function toSemanticRunStatus(
  job: SemanticJob,
  keywordsUsed: string[],
): SemanticRunStatus {
  return {
    status: job.status === "queued" ? "running" : job.status,
    processed: job.processed,
    total: job.total,
    summary: job.summary,
    keywordsUsed,
  };
}
