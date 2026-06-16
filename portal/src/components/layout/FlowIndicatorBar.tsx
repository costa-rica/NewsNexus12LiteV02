"use client";

import { useFlow } from "@/state/FlowContext";

import { FlowIndicator } from "./FlowIndicator";

export function FlowIndicatorBar() {
  const { state } = useFlow();
  const canAdvance =
    (state.currentStage === "search" && state.articles.length > 0) ||
    (state.currentStage === "scrape" &&
      state.scrapeRun?.status === "completed") ||
    (state.currentStage === "location" &&
      state.locationRun?.status === "completed" &&
      state.locationRun.summary.processed > 0);

  return <FlowIndicator canAdvance={canAdvance} />;
}
