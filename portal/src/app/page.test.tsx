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

    expect(withinStage.getByTestId("top-bar")).toBeInTheDocument();
    expect(withinStage.getByTestId("flow-indicator")).toBeInTheDocument();
    expect(withinStage.getByTestId("articles-table-region")).toBeInTheDocument();
    expect(slideStage).toHaveAttribute("data-current-stage", "search");
    expect(
      withinStage.getByRole("button", { name: /next/i }),
    ).toBeDisabled();
  });
});
