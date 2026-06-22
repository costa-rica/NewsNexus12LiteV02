"use client";

import { LocationBar } from "@/components/location/LocationBar";
import { ScrapeBar } from "@/components/scrape/ScrapeBar";
import { SemanticBar } from "@/components/semantic/SemanticBar";
import { StateBar } from "@/components/state/StateBar";
import { useFlow } from "@/state/FlowContext";

import { SearchBar } from "./SearchBar";

export function StageActionArea() {
  const { state } = useFlow();

  if (state.currentStage === "search") {
    return <SearchBar />;
  }

  if (state.currentStage === "scrape") {
    return <ScrapeBar />;
  }

  if (state.currentStage === "location") {
    return <LocationBar />;
  }

  if (state.currentStage === "state") {
    return <StateBar />;
  }

  return <SemanticBar />;
}
