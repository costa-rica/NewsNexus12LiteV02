"use client";

import { useFlow } from "@/state/FlowContext";

import { FlowIndicator } from "./FlowIndicator";

export function FlowIndicatorBar() {
  const { state } = useFlow();
  const stateRunActive =
    state.stateRun?.status === "queued" || state.stateRun?.status === "running";
  const semanticRunActive = state.semanticRun?.status === "running";
  const hasValidStateAssignment = state.articles.some(
    (article) =>
      article.stateAssignment?.resultStatus === "assigned" ||
      article.stateAssignment?.resultStatus === "no_state",
  );
  const canAdvance =
    (state.currentStage === "search" && state.articles.length > 0) ||
    (state.currentStage === "scrape" &&
      state.scrapeRun?.status === "completed") ||
    (state.currentStage === "location" &&
      state.locationRun?.status === "completed" &&
      state.locationRun.summary.processed > 0) ||
    (state.currentStage === "state" &&
      !stateRunActive &&
      hasValidStateAssignment) ||
    (state.currentStage === "semantic" &&
      !semanticRunActive &&
      state.semanticRun?.status === "completed" &&
      state.semanticRun.summary.processed > 0);

  return <FlowIndicator canAdvance={canAdvance} />;
}
