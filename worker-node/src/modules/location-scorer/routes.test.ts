import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { clearJobsForTests } from "../../jobs/registry.js";
import type { LocationClassifier, LocationResults } from "./types.js";

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fakeClassifier(score = 0.8): LocationClassifier {
  return {
    load: async () => {},
    score: async () => score,
  };
}

describe("location-scorer routes", () => {
  afterEach(() => {
    clearJobsForTests();
  });

  it("scores eligible articles, skips text-less rows, and ignores already-rated rows", async () => {
    const app = createApp({ locationClassifier: fakeClassifier(0.9) });

    const startResponse = await request(app)
      .post("/location-scorer/start-job")
      .send({
        articles: [
          { id: "a1", title: "US wildfire", description: "in California" },
          { id: "a2", title: "  ", description: "" },
          { id: "a3", title: "Already", description: "rated", locationRating: 0.5 },
        ],
      });

    expect(startResponse.status).toBe(202);
    expect(startResponse.body).toMatchObject({
      status: "queued",
      endpointName: "location-scorer",
    });

    await wait(10);

    const jobResponse = await request(app).get(`/jobs/${startResponse.body.jobId}`);
    expect(jobResponse.body).toMatchObject({
      status: "completed",
      summary: { eligible: 1, skipped: 1, processed: 1, modelLoading: 0 },
    });

    const results = jobResponse.body.results as LocationResults;
    expect(results.scores).toEqual([
      { article_id: "a1", score: 0.9, rating_for: "Occurred in the United States" },
    ]);
    expect(results.skippedIds).toEqual(["a2"]);
  });

  it("rejects a request without an articles array using the error envelope", async () => {
    const app = createApp({ locationClassifier: fakeClassifier() });

    const response = await request(app).post("/location-scorer/start-job").send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR", status: 400 },
    });
  });

  it("fails the job when the classifier throws (e.g. US label missing)", async () => {
    const failing: LocationClassifier = {
      load: async () => {},
      score: async () => {
        throw new Error("US label missing from classifier result");
      },
    };
    const app = createApp({ locationClassifier: failing });

    const startResponse = await request(app)
      .post("/location-scorer/start-job")
      .send({ articles: [{ id: "a1", title: "US wildfire" }] });

    await wait(10);

    const jobResponse = await request(app).get(`/jobs/${startResponse.body.jobId}`);
    expect(jobResponse.body.status).toBe("failed");
  });

  it("cancels a location job mid-run", async () => {
    const slow: LocationClassifier = {
      load: async () => {},
      score: async () => {
        await wait(30);
        return 0.5;
      },
    };
    const app = createApp({ locationClassifier: slow });

    const startResponse = await request(app)
      .post("/location-scorer/start-job")
      .send({ articles: [{ id: "a1", title: "one" }, { id: "a2", title: "two" }] });

    await wait(1);
    const cancelResponse = await request(app).post(
      `/jobs/${startResponse.body.jobId}/cancel`,
    );
    expect(cancelResponse.body.status).toBe("cancelled");

    await wait(40);
    const jobResponse = await request(app).get(`/jobs/${startResponse.body.jobId}`);
    expect(jobResponse.body.status).toBe("cancelled");
  });
});
