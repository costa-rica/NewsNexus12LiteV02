import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { FlowProvider } from "@/state/FlowContext";

describe("ArticlesTable", () => {
  it("renders the seven stage columns in order", () => {
    render(
      <FlowProvider>
        <ArticlesTable />
      </FlowProvider>,
    );

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(headers).toEqual([
      "Title",
      "News Source",
      "Description",
      "Scraped",
      "Nexus Location Rating",
      "State (AI Assigned)",
      "Nexus Semantic Rating",
    ]);
    expect(screen.getByText("No articles yet.")).toBeInTheDocument();
  });
});
