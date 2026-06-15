"use client";

import { useFlow } from "@/state/FlowContext";

import { SearchBar } from "./SearchBar";

export function StageActionArea() {
  const { state } = useFlow();

  if (state.currentStage !== "search") {
    return null;
  }

  return <SearchBar />;
}
