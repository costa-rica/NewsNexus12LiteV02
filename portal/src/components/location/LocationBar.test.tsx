import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { LocationBar } from "@/components/location/LocationBar";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { pollJob, WorkerRequestError } from "@/lib/worker/jobClient";
import { startLocationJob, type LocationJob } from "@/lib/worker/locationClient";
import { FlowProvider } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

vi.mock("@/lib/worker/jobClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worker/jobClient")>();
  return { ...actual, pollJob: vi.fn() };
});

vi.mock("@/lib/worker/locationClient", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/worker/locationClient")>();
  return { ...actual, startLocationJob: vi.fn() };
});

const initialState: FlowState = {
  currentStage: "location",
  articles: [
    {
      id: "article-1",
      title: "US wildfire",
      source: "Example News",
      description: "in California",
      link: "https://example.com/1",
    },
    {
      id: "article-2",
      title: "No usable text",
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
      <LocationBar />
      <ArticlesTable />
    </FlowProvider>,
  );
}

const queued = {
  jobId: "job-1",
  status: "queued" as const,
  endpointName: "location-scorer",
};

describe("LocationBar", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rates articles, shows N/A for skipped rows, and enables Next", async () => {
    (startLocationJob as unknown as Mock).mockResolvedValue(queued);
    const completed: LocationJob = {
      jobId: "job-1",
      workflow: "location-scorer",
      endpointName: "location-scorer",
      status: "completed",
      processed: 1,
      total: 2,
      summary: { eligible: 1, processed: 1, skipped: 1, modelLoading: 0 },
      results: {
        scores: [{ article_id: "article-1", score: 0.92 }],
        skippedIds: ["article-2"],
      },
    };
    (pollJob as unknown as Mock).mockResolvedValue(completed);

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    await waitFor(() => {
      expect(screen.getByText("92%")).toBeInTheDocument();
    });
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("warns and keeps Next disabled when every article is skipped", async () => {
    (startLocationJob as unknown as Mock).mockResolvedValue(queued);
    const completed: LocationJob = {
      jobId: "job-1",
      workflow: "location-scorer",
      endpointName: "location-scorer",
      status: "completed",
      processed: 0,
      total: 2,
      summary: { eligible: 0, processed: 0, skipped: 2, modelLoading: 0 },
      results: { scores: [], skippedIds: ["article-1", "article-2"] },
    };
    (pollJob as unknown as Mock).mockResolvedValue(completed);

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Start Rating" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No articles had usable text to rate.",
      );
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows a worker error message when the job fails to start", async () => {
    (startLocationJob as unknown as Mock).mockRejectedValue(
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
});
