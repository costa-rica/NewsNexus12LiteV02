import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { clearJobsForTests } from "../../jobs/registry.js";
import type { SemanticResults, SemanticScorer } from "./types.js";

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fakeScorer(score = 0.82): SemanticScorer {
  return {
    load: async () => {},
    score: async (_text, keywords) => ({ score, label: keywords[0] ?? "keyword" }),
  };
}

describe("semantic-scorer routes", () => {
  afterEach(() => {
    clearJobsForTests();
  });

  it("scores eligible articles and skips text-less or already-rated rows", async () => {
    const app = createApp({ semanticScorer: fakeScorer(0.91) });

    const startResponse = await request(app)
      .post("/semantic-scorer/start-job")
      .send({
        keywords: [" fire hazard ", "injury"],
        articles: [
          { id: "a1", title: "Fire", description: "Electrical fire" },
          { id: "a2", title: " ", description: "" },
          { id: "a3", title: "Already", semanticRatingMax: 0.7 },
        ],
      });

    expect(startResponse.status).toBe(202);
    expect(startResponse.body).toMatchObject({
      status: "queued",
      endpointName: "semantic-scorer",
    });

    await wait(10);

    const jobResponse = await request(app).get(`/jobs/${startResponse.body.jobId}`);
    expect(jobResponse.body).toMatchObject({
      status: "completed",
      summary: {
        eligible: 1,
        skipped: 1,
        processed: 1,
        failed: 0,
        modelLoading: 0,
      },
    });

    const results = jobResponse.body.results as SemanticResults;
    expect(results.scores).toEqual([
      { article_id: "a1", score: 0.91, rating_for: "fire hazard" },
    ]);
    expect(results.skippedIds).toEqual(["a2"]);
  });

  it("rejects empty keyword lists using the error envelope", async () => {
    const app = createApp({ semanticScorer: fakeScorer() });

    const response = await request(app)
      .post("/semantic-scorer/start-job")
      .send({ articles: [{ id: "a1", title: "Fire" }], keywords: [" "] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR", status: 400 },
    });
  });
});
