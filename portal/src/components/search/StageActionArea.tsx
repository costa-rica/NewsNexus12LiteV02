"use client";

import { LocationBar } from "@/components/location/LocationBar";
import { ScrapeBar } from "@/components/scrape/ScrapeBar";
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

  return null;
}
