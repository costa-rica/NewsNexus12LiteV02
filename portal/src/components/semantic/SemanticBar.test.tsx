import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { SemanticBar } from "@/components/semantic/SemanticBar";
import { SemanticKeywordEditor } from "@/components/semantic/SemanticKeywordEditor";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { pollJob, WorkerRequestError } from "@/lib/worker/jobClient";
import { startSemanticJob, type SemanticJob } from "@/lib/worker/semanticClient";
import { FlowProvider } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

vi.mock("@/lib/worker/jobClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worker/jobClient")>();
  return { ...actual, pollJob: vi.fn() };
});

vi.mock("@/lib/worker/semanticClient", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/worker/semanticClient")>();
  return { ...actual, startSemanticJob: vi.fn() };
});

const initialState: FlowState = {
  currentStage: "semantic",
  articles: [
    {
      id: "article-1",
      title: "Electrical fire",
      source: "Example News",
      description: "A product caused an electrical fire.",
      link: "https://example.com/1",
    },
    {
      id: "article-2",
      title: "",
      source: "Example News",
      description: "",
      link: "https://example.com/2",
    },
  ],
};

function renderHarness(state: FlowState = initialState) {
  return render(
    <FlowProvider initialState={state}>
      <FlowIndicatorBar />
      <SemanticBar />
      <ArticlesTable />
      <SemanticKeywordEditor />
    </FlowProvider>,
  );
}

const queued = {
  jobId: "job-1",
  status: "queued" as const,
  endpointName: "semantic-scorer",
};

describe("SemanticBar", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the Start Rating action on the semantic stage", () => {
    renderHarness();

    expect(
      screen.getByRole("button", { name: "Start Rating" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("region", { name: "Semantic keyword editor" }),
    ).toBeInTheDocument();
  });

  it("rates articles, marks skipped rows N/A, and disables rerun after completion", async () => {
    (startSemanticJob as unknown as Mock).mockResolvedValue(queued);
    const completed: SemanticJob = {
      jobId: "job-1",
      workflow: "semantic-scorer",
      endpointName: "semantic-scorer",
      status: "completed",
      processed: 1,
      total: 2,
      summary: {
        eligible: 1,
        processed: 1,
        skipped: 1,
        failed: 0,
        modelLoading: 0,
      },
      results: {
        scores: [
          {
            article_id: "article-1",
            score: 0.88,
            rating_for: "electrical fire",
          },
        ],
        skippedIds: ["article-2"],
        failures: [],
      },
    };
    (pollJob as unknown as Mock).mockResolvedValue(completed);

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    await waitFor(() => {
      expect(screen.getByText("88%")).toBeInTheDocument();
    });
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Rating" })).toBeDisabled();
  });

  it("shows a progress dialog while semantic rating is running", async () => {
    (startSemanticJob as unknown as Mock).mockResolvedValue(queued);
    (pollJob as unknown as Mock).mockImplementation(() => new Promise(() => {}));

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Rating article semantics",
    });
    expect(dialog).toHaveTextContent("Rating article semantics");
    expect(dialog).toHaveTextContent("0/0 rated");
  });

  it("warns when the keyword list is empty", async () => {
    renderHarness({ ...initialState, semanticKeywordDraft: "  \n " });

    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add at least one semantic keyword before rating.",
    );
    expect(startSemanticJob).not.toHaveBeenCalled();
  });

  it("shows a worker error message when the job fails to start", async () => {
    (startSemanticJob as unknown as Mock).mockRejectedValue(
      new WorkerRequestError(
        "Worker service unavailable. Start the worker and try again.",
        503,
        "SERVICE_UNAVAILABLE",
      ),
    );

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Worker service unavailable. Start the worker and try again.",
      );
    });
  });

  it("shows a generic error when the accepted semantic job fails", async () => {
    (startSemanticJob as unknown as Mock).mockResolvedValue(queued);
    const failed: SemanticJob = {
      jobId: "job-1",
      workflow: "semantic-scorer",
      endpointName: "semantic-scorer",
      status: "failed",
      processed: 0,
      total: 1,
      summary: {
        eligible: 1,
        processed: 0,
        skipped: 0,
        failed: 0,
        modelLoading: 0,
      },
      error: "Internal model failure",
    };
    (pollJob as unknown as Mock).mockResolvedValue(failed);

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Semantic rating job failed. Please try again.",
      );
    });
  });
});
