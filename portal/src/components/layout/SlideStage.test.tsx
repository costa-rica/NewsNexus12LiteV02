import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SlideStage } from "@/components/layout/SlideStage";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { setStage } from "@/state/flowReducer";
import { FlowProvider, useFlow } from "@/state/FlowContext";

function SlideHarness() {
  const { dispatch } = useFlow();

  return (
    <>
      <button type="button" onClick={() => dispatch(setStage("scrape"))}>
        Move stage
      </button>
      <SlideStage>
        <ArticlesTable />
      </SlideStage>
    </>
  );
}

describe("SlideStage", () => {
  it("reacts to currentStage changes without changing the table contract", () => {
    render(
      <FlowProvider>
        <SlideHarness />
      </FlowProvider>,
    );

    const stage = screen.getByTestId("slide-stage");
    expect(stage).toHaveAttribute("data-current-stage", "search");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getByTestId("app-footer")).toHaveTextContent("version dev");

    fireEvent.click(screen.getByRole("button", { name: "Move stage" }));

    expect(stage).toHaveAttribute("data-current-stage", "scrape");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });
});
