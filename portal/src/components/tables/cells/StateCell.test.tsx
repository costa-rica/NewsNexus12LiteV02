import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StateCell } from "./StateCell";

describe("StateCell", () => {
  it("renders empty when assignment has not run", () => {
    const { container } = render(<StateCell />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders an assigned state as compact text or a trigger", () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <StateCell
        assignment={{ resultStatus: "assigned", stateName: "California" }}
      />,
    );

    expect(screen.getByText("California")).toBeInTheDocument();

    rerender(
      <StateCell
        assignment={{ resultStatus: "assigned", stateName: "California" }}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "California" }));

    expect(onOpen).toHaveBeenCalledWith({
      resultStatus: "assigned",
      stateName: "California",
    });
  });

  it("renders no_state as No state", () => {
    render(<StateCell assignment={{ resultStatus: "no_state", stateName: "" }} />);

    expect(screen.getByText("No state")).toBeInTheDocument();
  });

  it("renders failed and skipped as N/A", () => {
    const { rerender } = render(
      <StateCell assignment={{ resultStatus: "failed" }} />,
    );

    expect(screen.getByText("N/A")).toBeInTheDocument();

    rerender(<StateCell assignment={{ resultStatus: "skipped" }} />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });
});
