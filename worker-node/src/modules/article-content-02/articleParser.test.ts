import { describe, expect, it } from "vitest";

import { parseArticleHtml } from "./articleParser.js";

describe("parseArticleHtml", () => {
  it("removes non-content elements and prefers og:title", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Open Graph Title" />
          <title>Document Title</title>
        </head>
        <body>
          <header>Navigation text should go away</header>
          <h1>Heading Title</h1>
          <script>bad()</script>
          <p>${"First useful paragraph with article substance. ".repeat(4)}</p>
          <p>too short</p>
          <p>${"Second useful paragraph with article substance. ".repeat(4)}</p>
          <footer>Footer text should go away</footer>
        </body>
      </html>
    `;

    const parsed = parseArticleHtml(html);

    expect(parsed.status).toBe("success");
    expect(parsed.title).toBe("Open Graph Title");
    expect(parsed.content).toContain("First useful paragraph");
    expect(parsed.content).toContain("Second useful paragraph");
    expect(parsed.content).not.toContain("Navigation text");
    expect(parsed.content).not.toContain("Footer text");
    expect(parsed.content).not.toContain("bad()");
  });

  it("falls back from h1 to title", () => {
    expect(parseArticleHtml("<h1>Heading Only</h1><p>short</p>", { contentMinLength: 1 }).title).toBe(
      "Heading Only",
    );

    expect(
      parseArticleHtml("<title>Title Only</title><body>long enough body</body>", {
        contentMinLength: 1,
      }).title,
    ).toBe("Title Only");
  });

  it("marks short parsed content as short_content", () => {
    const parsed = parseArticleHtml("<h1>Short</h1><p>tiny</p>");

    expect(parsed).toMatchObject({
      status: "fail",
      failureType: "short_content",
    });
  });
});
