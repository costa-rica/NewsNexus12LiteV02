import type { StageKey } from "@/state/types";

export interface PipelineStage {
  key: StageKey;
  label: string;
  tint: {
    light: string;
    dark: string;
  };
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "search",
    label: "Search",
    tint: {
      light: "#e7ebf2",
      dark: "#101c35",
    },
  },
  {
    key: "scrape",
    label: "Scrape",
    tint: {
      light: "#dfe5ee",
      dark: "#132744",
    },
  },
  {
    key: "location",
    label: "Location",
    tint: {
      light: "#d8dee8",
      dark: "#153050",
    },
  },
  {
    key: "state",
    label: "State",
    tint: {
      light: "#d1d8e2",
      dark: "#17375a",
    },
  },
  {
    key: "semantic",
    label: "Semantic",
    tint: {
      light: "#cbd2dd",
      dark: "#193f66",
    },
  },
];

export function getStageIndex(stageKey: StageKey) {
  return PIPELINE_STAGES.findIndex((stage) => stage.key === stageKey);
}

export function getStageByKey(stageKey: StageKey) {
  return (
    PIPELINE_STAGES.find((stage) => stage.key === stageKey) ??
    PIPELINE_STAGES[0]
  );
}

export function getNextStage(stageKey: StageKey) {
  const index = getStageIndex(stageKey);
  return index >= 0 ? PIPELINE_STAGES[index + 1] : undefined;
}
