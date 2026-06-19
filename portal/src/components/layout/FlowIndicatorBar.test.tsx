import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { FlowProvider } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

function renderIndicator(initialState: FlowState) {
  return render(
    <FlowProvider initialState={initialState}>
      <FlowIndicatorBar />
    </FlowProvider>,
  );
}

function completedRunWithNoFreshValidAssignments() {
  return {
    status: "completed" as const,
    processed: 1,
    total: 1,
    summary: {
      eligible: 1,
      processed: 1,
      assigned: 0,
      noState: 0,
      failed: 1,
      skipped: 0,
      alreadyAssigned: 1,
    },
  };
}

describe("FlowIndicatorBar state gating", () => {
  it("keeps Next enabled after a rerun with no fresh valid assignments when prior assignments remain", () => {
    renderIndicator({
      currentStage: "state",
      articles: [
        {
          id: "assigned-row",
          title: "Prior assignment",
          source: "Example News",
          description: "Texas story",
          link: "https://example.com/assigned",
          stateAssignment: {
            occuredInTheUS: true,
            reasoning: "The prior run found Texas.",
            stateName: "Texas",
            resultStatus: "assigned",
          },
        },
        {
          id: "failed-row",
          title: "Failed retry",
          source: "Example News",
          description: "No new valid assignment",
          link: "https://example.com/failed",
          stateAssignment: {
            resultStatus: "failed",
            errorMessage: "Still failed.",
          },
        },
      ],
      stateRun: completedRunWithNoFreshValidAssignments(),
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("keeps Next disabled when no article has a valid state assignment", () => {
    renderIndicator({
      currentStage: "state",
      articles: [
        {
          id: "failed-row",
          title: "Failed retry",
          source: "Example News",
          description: "No valid assignment",
          link: "https://example.com/failed",
          stateAssignment: {
            resultStatus: "failed",
            errorMessage: "Still failed.",
          },
        },
      ],
      stateRun: completedRunWithNoFreshValidAssignments(),
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("keeps Next disabled while a state run is active even with valid assignments", () => {
    renderIndicator({
      currentStage: "state",
      articles: [
        {
          id: "assigned-row",
          title: "Prior assignment",
          source: "Example News",
          description: "Texas story",
          link: "https://example.com/assigned",
          stateAssignment: {
            occuredInTheUS: true,
            reasoning: "The prior run found Texas.",
            stateName: "Texas",
            resultStatus: "assigned",
          },
        },
      ],
      stateRun: {
        status: "running",
        processed: 0,
        total: 1,
        summary: {
          eligible: 1,
          processed: 0,
          assigned: 0,
          noState: 0,
          failed: 0,
          skipped: 0,
          alreadyAssigned: 0,
        },
      },
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
