import { describe, expect, it } from "vitest";

import { classifyGooglePage } from "./googleClassifier.js";

describe("classifyGooglePage", () => {
  it("detects consent and captcha pages as blocked", () => {
    expect(
      classifyGooglePage("https://consent.google.com/", "<html>Before you continue</html>"),
    ).toMatchObject({ status: "blocked" });

    expect(
      classifyGooglePage("https://www.google.com/sorry/index", "<html>captcha</html>"),
    ).toMatchObject({ status: "blocked" });
  });

  it("detects a generic Google News shell as blocked", () => {
    const result = classifyGooglePage(
      "https://news.google.com/home?hl=en-US",
      "<html><title>Google News</title><body>Top stories</body></html>",
    );

    expect(result).toMatchObject({ status: "blocked" });
  });

  it("allows publisher pages", () => {
    expect(
      classifyGooglePage("https://publisher.example/article", "<article>news story</article>"),
    ).toEqual({ status: "ok" });
  });
});
