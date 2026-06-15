"use client";

import type { CSSProperties, ReactNode } from "react";

import { getStageByKey, getStageIndex } from "@/lib/pipeline";
import { useFlow } from "@/state/FlowContext";

interface SlideStageProps {
  children: ReactNode;
}

type StageStyle = CSSProperties & {
  "--stage-index": number;
  "--stage-tint-light": string;
  "--stage-tint-dark": string;
};

export function SlideStage({ children }: SlideStageProps) {
  const { state } = useFlow();
  const currentStage = getStageByKey(state.currentStage);
  const currentIndex = Math.max(0, getStageIndex(state.currentStage));

  const style: StageStyle = {
    "--stage-index": currentIndex,
    "--stage-tint-light": currentStage.tint.light,
    "--stage-tint-dark": currentStage.tint.dark,
  };

  return (
    <main
      data-testid="slide-stage"
      data-current-stage={state.currentStage}
      className="slide-stage overflow-hidden text-gray-900 dark:text-white"
      style={style}
    >
      <div className="slide-stage__content">{children}</div>
    </main>
  );
}
