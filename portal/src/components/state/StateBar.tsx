"use client";

import { BrainCircuit, Square } from "lucide-react";
import { useRef, useState } from "react";

import {
  assignArticleState,
  StateAssignmentRequestError,
} from "@/lib/state-assigner/client";
import { defaultPrompt } from "@/lib/state-assigner/defaultPrompt";
import {
  applyStateAssignments,
  setStateRun,
} from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";
import type {
  Article,
  StateAssignmentResult,
  StateResultStatus,
  StateRunStatus,
  StateRunSummary,
} from "@/state/types";

type StateBarStatus =
  | { type: "idle" }
  | { type: "warning"; message: string }
  | { type: "error"; message: string };

interface EligibleArticle {
  article: Article;
  title: string;
  content: string;
}

const EMPTY_SUMMARY: StateRunSummary = {
  eligible: 0,
  processed: 0,
  assigned: 0,
  noState: 0,
  failed: 0,
  skipped: 0,
  alreadyAssigned: 0,
};

export function StateBar() {
  const { state, dispatch } = useFlow();
  const [status, setStatus] = useState<StateBarStatus>({ type: "idle" });
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const latestRunRef = useRef<StateRunStatus | null>(null);
  const run = state.stateRun;
  const isActive = run?.status === "queued" || run?.status === "running";
  const hasCompletedRun = run?.status === "completed";

  const updateRun = (nextRun: StateRunStatus) => {
    latestRunRef.current = nextRun;
    dispatch(setStateRun(nextRun));
  };

  const handleStart = async () => {
    if (hasCompletedRun) {
      return;
    }

    if (state.articles.length === 0 || isActive) {
      setStatus({
        type: "warning",
        message: "Search for articles before assigning states.",
      });
      return;
    }

    const effectivePrompt = state.statePromptDraft ?? defaultPrompt;
    const { eligible, alreadyAssigned } = getEligibleArticles(state.articles);
    const processedResults: StateAssignmentResult[] = [];
    const hadPriorValidAssignment = state.articles.some(hasValidStateAssignment);
    let summary: StateRunSummary = {
      ...EMPTY_SUMMARY,
      eligible: eligible.length,
      alreadyAssigned,
    };

    cancelledRef.current = false;
    setStatus({ type: "idle" });
    updateRun({
      status: "running",
      processed: 0,
      total: eligible.length,
      summary,
      promptUsed: effectivePrompt,
    });

    for (const item of eligible) {
      if (cancelledRef.current) {
        markCancelled(summary, effectivePrompt, eligible.length);
        return;
      }

      if (!item.title && !item.content) {
        const result: StateAssignmentResult = {
          articleId: item.article.id,
          assignment: {
            resultStatus: "skipped",
            errorMessage: "No usable article title or content.",
          },
        };
        processedResults.push(result);
        dispatch(applyStateAssignments([result]));
        summary = incrementSummary(summary, "skipped");
        updateRun({
          status: "running",
          processed: summary.processed,
          total: eligible.length,
          summary,
          promptUsed: effectivePrompt,
        });
        continue;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const assignment = await assignArticleState(
          {
            promptTemplate: effectivePrompt,
            title: item.title,
            content: item.content,
          },
          controller.signal,
        );
        const result: StateAssignmentResult = {
          articleId: item.article.id,
          assignment,
        };
        processedResults.push(result);
        dispatch(applyStateAssignments([result]));
        summary = incrementSummary(summary, assignment.resultStatus);
        updateRun({
          status: "running",
          processed: summary.processed,
          total: eligible.length,
          summary,
          promptUsed: effectivePrompt,
        });
      } catch (error) {
        if (cancelledRef.current) {
          markCancelled(summary, effectivePrompt, eligible.length);
          return;
        }

        if (error instanceof StateAssignmentRequestError) {
          setStatus({ type: "error", message: error.message });
          updateRun({
            status: "failed",
            processed: summary.processed,
            total: eligible.length,
            summary,
            promptUsed: effectivePrompt,
          });
          return;
        }

        setStatus({
          type: "error",
          message: "State assignment request failed. Please try again.",
        });
        updateRun({
          status: "failed",
          processed: summary.processed,
          total: eligible.length,
          summary,
          promptUsed: effectivePrompt,
        });
        return;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    }

    const hasValidAssignmentAfterRun =
      hadPriorValidAssignment ||
      processedResults.some((result) => hasValidAssignmentResult(result));

    updateRun({
      status: "completed",
      processed: summary.processed,
      total: eligible.length,
      summary,
      promptUsed: effectivePrompt,
    });

    if (!hasValidAssignmentAfterRun) {
      setStatus({
        type: "warning",
        message: "No articles received a state assignment or no-state result.",
      });
    }
  };

  const handleCancel = () => {
    if (!isActive) {
      return;
    }

    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    const currentRun = latestRunRef.current ?? run;

    if (currentRun) {
      updateRun({
        ...currentRun,
        status: "cancelled",
      });
    }
  };

  const progressLabel = run
    ? `${run.processed}/${run.total} processed`
    : `${state.articles.length} article${
        state.articles.length === 1 ? "" : "s"
      } ready`;

  return (
    <section
      className="stage-aligned-region pb-4"
      aria-label="State AI assignment"
    >
      <div className="rounded-lg border border-gray-200/80 bg-white/75 p-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              State AI assignment
            </div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {progressLabel}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleStart}
              disabled={isActive || hasCompletedRun || state.articles.length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
            >
              <BrainCircuit aria-hidden="true" className="h-4 w-4" />
              <span>Start Assigning States</span>
            </button>
            {isActive && (
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-theme-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Square aria-hidden="true" className="h-4 w-4" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>

        {run && (
          <div
            role="status"
            className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-200 sm:grid-cols-3 lg:grid-cols-6"
          >
            <span>Eligible {run.summary.eligible}</span>
            <span>Assigned {run.summary.assigned}</span>
            <span>No state {run.summary.noState}</span>
            <span>Failed {run.summary.failed}</span>
            <span>Skipped {run.summary.skipped}</span>
            <span>Already assigned {run.summary.alreadyAssigned ?? 0}</span>
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

  function markCancelled(
    summaryToKeep: StateRunSummary,
    promptUsed: string,
    total: number,
  ) {
    updateRun({
      status: "cancelled",
      processed: summaryToKeep.processed,
      total,
      summary: summaryToKeep,
      promptUsed,
    });
  }
}

function getEligibleArticles(articles: Article[]) {
  let alreadyAssigned = 0;
  const eligible: EligibleArticle[] = [];

  for (const article of articles) {
    if (hasValidStateAssignment(article)) {
      alreadyAssigned += 1;
      continue;
    }

    eligible.push({
      article,
      title: article.title.trim(),
      content: getUsableContent(article),
    });
  }

  return { eligible, alreadyAssigned };
}

function getUsableContent(article: Article) {
  const scrapedContent =
    article.scrape?.status === "success" ? article.scrape.content?.trim() : "";

  return scrapedContent || article.description.trim();
}

function hasValidStateAssignment(article: Article) {
  return (
    article.stateAssignment?.resultStatus === "assigned" ||
    article.stateAssignment?.resultStatus === "no_state"
  );
}

function hasValidAssignmentResult(result: StateAssignmentResult) {
  return (
    result.assignment.resultStatus === "assigned" ||
    result.assignment.resultStatus === "no_state"
  );
}

function incrementSummary(
  summary: StateRunSummary,
  resultStatus: StateResultStatus,
): StateRunSummary {
  return {
    ...summary,
    processed: summary.processed + 1,
    assigned: summary.assigned + (resultStatus === "assigned" ? 1 : 0),
    noState: summary.noState + (resultStatus === "no_state" ? 1 : 0),
    failed: summary.failed + (resultStatus === "failed" ? 1 : 0),
    skipped: summary.skipped + (resultStatus === "skipped" ? 1 : 0),
  };
}
