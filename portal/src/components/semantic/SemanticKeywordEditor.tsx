"use client";

import { defaultSemanticKeywordDraft } from "@/lib/semantic-scorer/defaultKeywords";
import { setSemanticKeywordDraft } from "@/state/flowReducer";
import { useFlow } from "@/state/FlowContext";

export function SemanticKeywordEditorSlot() {
  const { state } = useFlow();

  if (state.currentStage !== "semantic") {
    return null;
  }

  return <SemanticKeywordEditor />;
}

export function SemanticKeywordEditor() {
  const { state, dispatch } = useFlow();
  const isActive = state.semanticRun?.status === "running";

  return (
    <section
      className="stage-aligned-region pb-8"
      aria-label="Semantic keyword editor"
    >
      <label className="block rounded-lg border border-gray-200/80 bg-white/75 p-4 shadow-theme-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/45">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          Semantic keywords
        </span>
        <textarea
          value={state.semanticKeywordDraft ?? defaultSemanticKeywordDraft}
          onChange={(event) =>
            dispatch(setSemanticKeywordDraft(event.currentTarget.value))
          }
          disabled={isActive}
          className="mt-3 min-h-56 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-3 font-mono text-sm leading-6 text-gray-900 shadow-theme-sm outline-none transition-colors placeholder:text-gray-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:disabled:bg-gray-950 dark:disabled:text-gray-500"
        />
      </label>
    </section>
  );
}
