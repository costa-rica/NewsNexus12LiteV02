import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { StateBar } from "@/components/state/StateBar";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { assignArticleState } from "@/lib/state-assigner/client";
import { defaultPrompt } from "@/lib/state-assigner/defaultPrompt";
import { FlowProvider, useFlow } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

vi.mock("@/lib/state-assigner/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/state-assigner/client")>();
  return { ...actual, assignArticleState: vi.fn() };
});

const freshState: FlowState = {
  currentStage: "state",
  articles: [
    {
      id: "article-1",
      title: "Wildfire in Los Angeles",
      source: "Example News",
      description: "Evacuations in California.",
      link: "https://example.com/1",
    },
  ],
};

function renderHarness(initialState: FlowState = freshState) {
  return render(
    <FlowProvider initialState={initialState}>
      <FlowIndicatorBar />
      <StateBar />
      <ArticlesTable />
      <PromptUsedProbe />
    </FlowProvider>,
  );
}

function PromptUsedProbe() {
  const { state } = useFlow();

  return (
    <output data-testid="prompt-used">
      {state.stateRun?.promptUsed === defaultPrompt ? "default" : ""}
    </output>
  );
}

describe("StateBar", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the start button disabled until there is at least one article", () => {
    renderHarness({
      currentStage: "state",
      articles: [],
    });

    expect(
      screen.getByRole("button", { name: "Start Assigning States" }),
    ).toBeDisabled();
  });

  it("uses the default prompt when draft is unset and enables Next for no_state", async () => {
    (assignArticleState as unknown as Mock).mockResolvedValue({
      occuredInTheUS: false,
      reasoning: "No U.S. location is supported.",
      stateName: "",
      resultStatus: "no_state",
    });

    renderHarness();
    fireEvent.click(
      screen.getByRole("button", { name: "Start Assigning States" }),
    );

    await waitFor(() => {
      expect(screen.getByText("No state")).toBeInTheDocument();
    });

    expect(screen.getByTestId("prompt-used")).toHaveTextContent("default");
    expect(assignArticleState).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTemplate: defaultPrompt,
        title: "Wildfire in Los Angeles",
        content: "Evacuations in California.",
      }),
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Start Assigning States" }),
    ).toBeDisabled();
  });

  it("shows cancel and disables start while a run is active", async () => {
    let seenSignal: AbortSignal | undefined;
    (assignArticleState as unknown as Mock).mockImplementation(
      (_args: unknown, signal?: AbortSignal) => {
        seenSignal = signal;

        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("abort", "AbortError"));
          });
        });
      },
    );

    renderHarness();
    fireEvent.click(
      screen.getByRole("button", { name: "Start Assigning States" }),
    );

    await waitFor(() => {
      expect(assignArticleState).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByRole("button", { name: "Start Assigning States" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    });
    expect(seenSignal?.aborted).toBe(true);
  });

  it("stores content-skip rows and keeps Next disabled when no valid assignment exists", async () => {
    renderHarness({
      currentStage: "state",
      articles: [
        {
          id: "article-1",
          title: "",
          source: "Example News",
          description: "",
          link: "https://example.com/1",
        },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Start Assigning States" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No articles received a state assignment or no-state result.",
      );
    });

    expect(assignArticleState).not.toHaveBeenCalled();
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.getByText("Skipped 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("excludes completed rerun rows and retries failed or fresh rows only", async () => {
    (assignArticleState as unknown as Mock)
      .mockResolvedValueOnce({
        occuredInTheUS: true,
        reasoning: "The retry now names Los Angeles.",
        stateName: "California",
        resultStatus: "assigned",
      })
      .mockResolvedValueOnce({
        resultStatus: "failed",
        errorMessage: "OpenAI response was not valid JSON.",
      });

    renderHarness({
      currentStage: "state",
      articles: [
        {
          id: "assigned-row",
          title: "Completed assignment",
          source: "Example News",
          description: "Texas story",
          link: "https://example.com/assigned",
          stateAssignment: {
            occuredInTheUS: true,
            reasoning: "The original run found Texas.",
            stateName: "Texas",
            resultStatus: "assigned",
          },
        },
        {
          id: "no-state-row",
          title: "Completed no-state",
          source: "Example News",
          description: "International story",
          link: "https://example.com/no-state",
          stateAssignment: {
            occuredInTheUS: false,
            reasoning: "The original run found no U.S. location.",
            stateName: "",
            resultStatus: "no_state",
          },
        },
        {
          id: "failed-row",
          title: "Failed retry",
          source: "Example News",
          description: "Los Angeles story",
          link: "https://example.com/failed",
          stateAssignment: {
            resultStatus: "failed",
            errorMessage: "Previous failure.",
          },
        },
        {
          id: "fresh-row",
          title: "Fresh row",
          source: "Example News",
          description: "Fresh article text",
          link: "https://example.com/fresh",
        },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Start Assigning States" }),
    );

    await waitFor(() => {
      expect(assignArticleState).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText("Already assigned 2")).toBeInTheDocument();
    expect((assignArticleState as unknown as Mock).mock.calls[0][0]).toMatchObject({
      title: "Failed retry",
    });
    expect((assignArticleState as unknown as Mock).mock.calls[1][0]).toMatchObject({
      title: "Fresh row",
    });
    expect(screen.getByText("Texas")).toBeInTheDocument();
    expect(screen.getByText("No state")).toBeInTheDocument();
    expect(screen.getByText("California")).toBeInTheDocument();
    expect(screen.getByText("Skipped 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
