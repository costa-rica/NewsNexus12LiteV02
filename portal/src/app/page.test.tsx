import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { FlowProvider } from "@/state/FlowContext";

describe("HomePage composition", () => {
  it("renders one top bar and keeps persistent regions inside SlideStage", () => {
    render(
      <ThemeProvider>
        <FlowProvider>
          <HomePage />
        </FlowProvider>
      </ThemeProvider>,
    );

    expect(screen.getAllByTestId("top-bar")).toHaveLength(1);

    const slideStage = screen.getByTestId("slide-stage");
    const withinStage = within(slideStage);

    const topBar = withinStage.getByTestId("top-bar");
    const flowIndicator = withinStage.getByTestId("flow-indicator");
    const searchRegion = withinStage.getByRole("region", {
      name: /google rss search/i,
    });
    const articlesTableRegion = withinStage.getByTestId("articles-table-region");

    expect(topBar).toBeInTheDocument();
    expect(flowIndicator).toBeInTheDocument();
    expect(articlesTableRegion).toBeInTheDocument();
    expect(topBar).toHaveClass("stage-aligned-region");
    expect(flowIndicator).toHaveClass("stage-aligned-region");
    expect(searchRegion).toHaveClass("stage-aligned-region");
    expect(articlesTableRegion).toHaveClass("stage-aligned-region");
    expect(slideStage).toHaveAttribute("data-current-stage", "search");
    expect(
      withinStage.getByRole("button", { name: /next/i }),
    ).toBeDisabled();
  });
});
