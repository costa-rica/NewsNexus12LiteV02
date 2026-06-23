import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScrapedCell } from "./ScrapedCell";

const longContent = "Scraped article body. ".repeat(12);

describe("ScrapedCell", () => {
  it("renders empty for absent, failed, and short scrape results", () => {
    const { container, rerender } = render(<ScrapedCell />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ScrapedCell
        scrape={{
          status: "fail",
          failureType: "blocked_google",
          content: longContent,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ScrapedCell
        scrape={{
          status: "success",
          content: "short",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a modal for successful scrape results with enough content", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ScrapedCell
        scrape={{
          status: "success",
          title: "Scraped title",
          publisherUrl: "https://publisher.example/article",
          bodySource: "direct-http",
          extractionSource: "canonical",
          content: longContent,
        }}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open scraped article" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", {
      name: "Scraped article content",
    });
    expect(dialog).toBeInTheDocument();
    expect(document.body).toContainElement(dialog);
    expect(container).not.toContainElement(dialog);
    expect(screen.getByText("Scraped title")).toBeInTheDocument();
    expect(screen.getByText("https://publisher.example/article")).toBeInTheDocument();
    expect(screen.getByText("direct-http")).toBeInTheDocument();
    expect(screen.getByText("canonical")).toBeInTheDocument();
    expect(screen.getByText(longContent.trim())).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close scraped article" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
