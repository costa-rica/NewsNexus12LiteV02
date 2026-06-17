"use client";

import { ArrowRight, Check } from "lucide-react";

import { getNextStage, getStageIndex, PIPELINE_STAGES } from "@/lib/pipeline";
import { setStage } from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";

interface FlowIndicatorProps {
  canAdvance?: boolean;
}

export function FlowIndicator({ canAdvance = false }: FlowIndicatorProps) {
  const { state, dispatch } = useFlow();
  const currentIndex = getStageIndex(state.currentStage);
  const nextStage = getNextStage(state.currentStage);

  const handleNext = () => {
    if (!nextStage) {
      return;
    }

    dispatch(setStage(nextStage.key));
  };

  return (
    <section
      data-testid="flow-indicator"
      className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8"
      aria-label="Pipeline progress"
    >
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200/80 bg-white/70 px-4 py-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45 sm:flex-row sm:items-center sm:justify-between">
        <ol className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-5">
          {PIPELINE_STAGES.map((stage, index) => {
            const isCurrent = stage.key === state.currentStage;
            const isComplete = index < currentIndex;

            return (
              <li key={stage.key} className="flex min-w-0 items-center gap-2">
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    isCurrent
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-300 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
                    isComplete
                      ? "border-green-500 bg-green-500 text-white"
                      : "",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {isComplete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={[
                    "truncate text-sm font-medium",
                    isCurrent
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-500 dark:text-gray-400",
                  ].join(" ")}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance || !nextStage}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
        >
          <span>Next</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
