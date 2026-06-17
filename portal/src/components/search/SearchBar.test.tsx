import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { SearchBar } from "@/components/search/SearchBar";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { FlowProvider } from "@/state/FlowContext";
import type { FlowState } from "@/state/types";

const existingArticle = {
  id: "existing-1",
  title: "Existing article",
  source: "Existing Source",
  description: "Existing description",
  link: "https://example.com/existing",
};

function renderSearchHarness(initialState?: FlowState) {
  return render(
    <FlowProvider initialState={initialState}>
      <FlowIndicatorBar />
      <SearchBar />
      <ArticlesTable />
    </FlowProvider>,
  );
}

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  const fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function submitQuery(query: string) {
  fireEvent.change(screen.getByLabelText("Google RSS query"), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

describe("SearchBar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a warning for a blank query and does not call fetch", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderSearchHarness();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a search query.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("populates the table, displays count/url, and enables Next on success", async () => {
    const fetch = mockFetchResponse({
      success: true,
      url: "https://news.google.com/rss/search?q=fire+when%3A7d",
      count: 1,
      articlesArray: [
        {
          id: "article-1",
          title: "Fire update",
          source: "Example News",
          description: "Fire description",
          link: "https://example.com/fire",
        },
      ],
    });

    renderSearchHarness();
    await submitQuery("fire");

    await waitFor(() => {
      expect(screen.getByText("Fire update")).toBeInTheDocument();
    });

    expect(screen.getByText("Example News")).toBeInTheDocument();
    expect(screen.getByText("Fire description")).toBeInTheDocument();
    expect(screen.getByText("Fetched 1 article.")).toBeInTheDocument();
    expect(
      screen.getByText("https://news.google.com/rss/search?q=fire+when%3A7d"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/google-rss/make-request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          and_keywords: "fire",
          and_exact_phrases: "",
          or_keywords: "",
          or_exact_phrases: "",
          time_range: "7d",
        }),
      }),
    );
  });

  it("keeps the existing table and shows a rate-limit message", async () => {
    mockFetchResponse(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Google News RSS temporarily unavailable, retry later.",
          status: 503,
        },
      },
      false,
      503,
    );

    renderSearchHarness({
      currentStage: "search",
      articles: [existingArticle],
    });
    await submitQuery("fire");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Google News RSS temporarily unavailable, retry later.",
      );
    });
    expect(screen.getByText("Existing article")).toBeInTheDocument();
  });

  it("keeps the existing table and shows a request-failed message", async () => {
    mockFetchResponse(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Request failed. Please try again.",
          status: 500,
        },
      },
      false,
      500,
    );

    renderSearchHarness({
      currentStage: "search",
      articles: [existingArticle],
    });
    await submitQuery("fire");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Request failed. Please try again.",
      );
    });
    expect(screen.getByText("Existing article")).toBeInTheDocument();
  });

  it("resets query text, generated URL, and the working set", async () => {
    mockFetchResponse({
      success: true,
      url: "https://news.google.com/rss/search?q=fire+when%3A7d",
      count: 1,
      articlesArray: [
        {
          id: "article-1",
          title: "Fire update",
          source: "Example News",
          description: "Fire description",
          link: "https://example.com/fire",
        },
      ],
    });

    renderSearchHarness();
    await submitQuery("fire");

    await waitFor(() => {
      expect(screen.getByText("Fire update")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Google RSS query")).toHaveValue("");
    expect(
      screen.queryByText("https://news.google.com/rss/search?q=fire+when%3A7d"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Fire update")).not.toBeInTheDocument();
    expect(screen.getByText("No articles yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
