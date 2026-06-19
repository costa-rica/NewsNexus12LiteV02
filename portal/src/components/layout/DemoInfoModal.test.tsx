import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { DemoInfoModal } from "./DemoInfoModal";

describe("DemoInfoModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens automatically on the first site visit", async () => {
    render(<DemoInfoModal />);

    const dialog = await screen.findByRole("dialog", {
      name: "News Nexus Lite demo",
    });

    expect(dialog).toHaveTextContent(
      "This demo version features an article approval process using automated AI workflows.",
    );
    expect(
      screen.getByRole("button", {
        name: "Try demo",
      }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Watch the 2 minute video on the full News Nexus architecture.",
    );
    expect(
      screen.getByRole("link", {
        name: "2 minute video",
      }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=dxFSxkwByWs");
    expect(window.localStorage.getItem("news-nexus-lite-demo-info-seen")).toBe(
      "true",
    );
  });

  it("does not open automatically after it has been seen", async () => {
    window.localStorage.setItem("news-nexus-lite-demo-info-seen", "true");

    render(<DemoInfoModal />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("can be reopened from the top bar info button", () => {
    window.localStorage.setItem("news-nexus-lite-demo-info-seen", "true");

    render(<DemoInfoModal />);
    fireEvent.click(screen.getByRole("button", { name: "About this demo" }));

    expect(
      screen.getByRole("dialog", { name: "News Nexus Lite demo" }),
    ).toBeInTheDocument();
  });

  it("closes the modal from the try demo button", async () => {
    render(<DemoInfoModal />);

    fireEvent.click(await screen.findByRole("button", { name: "Try demo" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
