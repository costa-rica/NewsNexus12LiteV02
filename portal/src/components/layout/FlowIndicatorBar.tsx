"use client";

import { useFlow } from "@/state/FlowContext";

import { FlowIndicator } from "./FlowIndicator";

export function FlowIndicatorBar() {
  const { state } = useFlow();
  const canAdvance =
    (state.currentStage === "search" && state.articles.length > 0) ||
    (state.currentStage === "scrape" &&
      state.scrapeRun?.status === "completed");

  return <FlowIndicator canAdvance={canAdvance} />;
}
