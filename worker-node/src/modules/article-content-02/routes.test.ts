import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { clearJobsForTests } from "../../jobs/registry.js";
import type { ScrapeProcessor } from "./enrichment.js";
import type { ScrapeResult } from "./types.js";

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("article-content-scraper-02 routes", () => {
  afterEach(() => {
    clearJobsForTests();
  });

  it("starts a scrape job and stores article results", async () => {
    const processor: ScrapeProcessor = async (article) => ({
      articleId: article.id,
      status: "success",
      content: "content ".repeat(40),
      extractionSource: "none",
      bodySource: "rss-feed",
    });
    const app = createApp({ scrapeProcessor: processor });
    const startResponse = await request(app)
      .post("/article-content-scraper-02/start-job")
      .send({ articles: [{ id: "a1", link: "https://example.com" }] });

    expect(startResponse.status).toBe(202);
    expect(startResponse.body).toMatchObject({
      status: "queued",
      endpointName: "article-content-scraper-02",
    });

    await wait(5);

    const jobResponse = await request(app).get(`/jobs/${startResponse.body.jobId}`);
    expect(jobResponse.body).toMatchObject({
      status: "completed",
      processed: 1,
      total: 1,
      summary: {
        considered: 1,
        skipped: 0,
        success: 1,
        failed: 0,
      },
    });
    expect(jobResponse.body.results).toEqual([
      expect.objectContaining({ articleId: "a1", status: "success" }) as ScrapeResult,
    ]);
  });

  it("rejects a request without an articles array using the error envelope", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/article-content-scraper-02/start-job")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR", status: 400 },
    });
    expect(typeof response.body.error.message).toBe("string");
  });

  it("cancels a scrape job mid-run", async () => {
    const processor: ScrapeProcessor = async (article, signal) => {
      await wait(30);

      if (signal.aborted) {
        throw new Error("aborted");
      }

      return {
        articleId: article.id,
        status: "success",
        content: "content ".repeat(40),
        extractionSource: "none",
        bodySource: "rss-feed",
      };
    };
    const app = createApp({ scrapeProcessor: processor });
    const startResponse = await request(app)
      .post("/article-content-scraper-02/start-job")
      .send({ articles: [{ id: "a1", link: "https://example.com" }] });

    await wait(1);

    const cancelResponse = await request(app).post(`/jobs/${startResponse.body.jobId}/cancel`);
    expect(cancelResponse.body.status).toBe("cancelled");

    await wait(35);

    const jobResponse = await request(app).get(`/jobs/${startResponse.body.jobId}`);
    expect(jobResponse.body.status).toBe("cancelled");
  });
});
