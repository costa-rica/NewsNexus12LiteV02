import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { ScrapeBar } from "@/components/scrape/ScrapeBar";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { pollJob, WorkerRequestError } from "@/lib/worker/jobClient";
import { startScrapeJob, type ScrapeJob } from "@/lib/worker/scrapeClient";
import { FlowProvider } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

vi.mock("@/lib/worker/jobClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worker/jobClient")>();
  return { ...actual, pollJob: vi.fn() };
});

vi.mock("@/lib/worker/scrapeClient", () => ({
  startScrapeJob: vi.fn(),
}));

const successContent = "Scraped article body. ".repeat(12);

const initialState: FlowState = {
  currentStage: "scrape",
  articles: [
    {
      id: "article-1",
      title: "First article",
      source: "Example News",
      description: "First description",
      link: "https://example.com/first",
    },
    {
      id: "article-2",
      title: "Second article",
      source: "Example News",
      description: "Second description",
      link: "https://example.com/second",
    },
  ],
};

function renderScrapeHarness(state: FlowState = initialState) {
  return render(
    <FlowProvider initialState={state}>
      <FlowIndicatorBar />
      <ScrapeBar />
      <ArticlesTable />
    </FlowProvider>,
  );
}

describe("ScrapeBar", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs the scrape job, merges results, and enables Next after completion", async () => {
    const completedJob: ScrapeJob = {
      jobId: "job-1",
      workflow: "article-content-scraper-02",
      endpointName: "article-content-scraper-02",
      status: "completed",
      processed: 2,
      total: 2,
      summary: {
        considered: 2,
        skipped: 0,
        success: 1,
        failed: 1,
      },
      results: [
        {
          articleId: "article-1",
          status: "success",
          title: "Scraped title",
          publisherUrl: "https://publisher.example/first",
          content: successContent,
          bodySource: "direct-http",
          extractionSource: "canonical",
        },
        {
          articleId: "article-2",
          status: "fail",
          failureType: "blocked_google",
          details: "Google blocked the page.",
        },
      ],
    };
    (startScrapeJob as unknown as Mock).mockResolvedValue({
      jobId: "job-1",
      status: "queued",
      endpointName: "article-content-scraper-02",
    });
    (pollJob as unknown as Mock).mockImplementation(
      async (_jobId: string, options?: { onUpdate?: (job: ScrapeJob) => void }) => {
        options?.onUpdate?.({
          ...completedJob,
          status: "running",
          processed: 1,
          summary: {
            considered: 1,
            skipped: 0,
            success: 1,
            failed: 0,
          },
          results: [completedJob.results?.[0] ?? {}],
        });

        return completedJob;
      },
    );

    renderScrapeHarness();

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scrape" }));

    await waitFor(() => {
      expect(screen.getByText("2/2 processed")).toBeInTheDocument();
    });

    expect(startScrapeJob).toHaveBeenCalledWith(initialState.articles);
    expect(pollJob).toHaveBeenCalledWith("job-1", expect.objectContaining({}));
    expect(screen.getByText("Considered 2")).toBeInTheDocument();
    expect(screen.getByText("Success 1")).toBeInTheDocument();
    expect(screen.getByText("Failed 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open scraped article" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("warns when there are no articles to scrape", () => {
    renderScrapeHarness({
      currentStage: "scrape",
      articles: [],
    });

    expect(screen.getByRole("button", { name: "Scrape" })).toBeDisabled();
  });

  it("shows a worker-specific error when worker-node is unavailable", async () => {
    (startScrapeJob as unknown as Mock).mockRejectedValue(
      new WorkerRequestError(
        "Worker service unavailable. Start the worker and try again.",
        503,
        "SERVICE_UNAVAILABLE",
      ),
    );

    renderScrapeHarness();

    fireEvent.click(screen.getByRole("button", { name: "Scrape" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Worker service unavailable. Start the worker and try again.",
      );
    });
  });
});
