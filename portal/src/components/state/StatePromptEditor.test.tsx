import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  StatePromptEditor,
  StatePromptEditorSlot,
} from "@/components/state/StatePromptEditor";
import { defaultPrompt } from "@/lib/state-assigner/defaultPrompt";
import { FlowProvider } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

function renderEditor(initialState: FlowState) {
  return render(
    <FlowProvider initialState={initialState}>
      <StatePromptEditor />
    </FlowProvider>,
  );
}

describe("StatePromptEditor", () => {
  it("renders the default prompt when the draft is unset", () => {
    renderEditor({
      currentStage: "state",
      articles: [],
    });

    expect(screen.getByLabelText("State assignment prompt")).toHaveValue(
      defaultPrompt,
    );
  });

  it("stores edited draft text in memory", () => {
    renderEditor({
      currentStage: "state",
      articles: [],
    });

    fireEvent.change(screen.getByLabelText("State assignment prompt"), {
      target: { value: "edited {articleTitle}" },
    });

    expect(screen.getByLabelText("State assignment prompt")).toHaveValue(
      "edited {articleTitle}",
    );
  });

  it("is disabled while a state run is active", () => {
    renderEditor({
      currentStage: "state",
      articles: [],
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

    expect(screen.getByLabelText("State assignment prompt")).toBeDisabled();
  });

  it("slot renders only on the state stage", () => {
    const { unmount } = render(
      <FlowProvider initialState={{ currentStage: "location", articles: [] }}>
        <StatePromptEditorSlot />
      </FlowProvider>,
    );

    expect(
      screen.queryByLabelText("State assignment prompt"),
    ).not.toBeInTheDocument();
    unmount();

    render(
      <FlowProvider initialState={{ currentStage: "state", articles: [] }}>
        <StatePromptEditorSlot />
      </FlowProvider>,
    );

    expect(screen.getByLabelText("State assignment prompt")).toBeInTheDocument();
  });
});
