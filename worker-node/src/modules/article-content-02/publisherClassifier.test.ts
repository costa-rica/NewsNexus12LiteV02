import { describe, expect, it } from "vitest";

import { classifyPublisherResponse } from "./publisherClassifier.js";

describe("classifyPublisherResponse", () => {
  it("detects blocked publisher responses", () => {
    expect(
      classifyPublisherResponse({
        html: "<html>Checking your browser before accessing this site</html>",
        statusCode: 403,
      }),
    ).toMatchObject({ status: "blocked" });
  });

  it("detects incomplete publisher responses", () => {
    expect(
      classifyPublisherResponse({
        html: "<html>Please enable cookies</html>",
        statusCode: 200,
      }),
    ).toMatchObject({ status: "incomplete" });
  });

  it("allows usable publisher responses", () => {
    const html = `<html><body>${"usable article content ".repeat(40)}</body></html>`;

    expect(classifyPublisherResponse({ html, statusCode: 200 })).toEqual({ status: "usable" });
  });
});
