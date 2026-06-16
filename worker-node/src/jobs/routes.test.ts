import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { clearJobsForTests, createJob } from "./registry.js";
import { runJob } from "./runner.js";

const app = createApp();

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("job routes", () => {
  afterEach(() => {
    clearJobsForTests();
  });

  it("returns 404 for an unknown job", async () => {
    const response = await request(app).get("/jobs/missing-job");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: { code: "NOT_FOUND", status: 404 },
    });
    expect(typeof response.body.error.message).toBe("string");
  });

  it("reports queued, running, and completed workflow states", async () => {
    const job = createJob<number[]>("fake-workflow", 2, {
      summary: { processed: 0 },
    });

    const queued = await request(app).get(`/jobs/${job.jobId}`);
    expect(queued.body.status).toBe("queued");

    const promise = runJob({
      job,
      items: [1, 2],
      processItem: async (item) => {
        await wait(10);
        return item * 2;
      },
      summarizeResults: (results) => ({ processed: results.length }),
    });

    await wait(1);
    const running = await request(app).get(`/jobs/${job.jobId}`);
    expect(running.body.status).toBe("running");

    await promise;

    const completed = await request(app).get(`/jobs/${job.jobId}`);
    expect(completed.body).toMatchObject({
      status: "completed",
      processed: 2,
      total: 2,
      results: [2, 4],
      summary: { processed: 2 },
    });
  });

  it("cancels a running workflow", async () => {
    const job = createJob<number[]>("fake-workflow", 2);

    const promise = runJob({
      job,
      items: [1, 2],
      processItem: async (_item, signal) => {
        await wait(20);
        if (signal.aborted) {
          throw new Error("aborted");
        }
        return 1;
      },
    });

    await wait(1);
    const cancelResponse = await request(app).post(`/jobs/${job.jobId}/cancel`);
    expect(cancelResponse.body.status).toBe("cancelled");

    await promise;

    const statusResponse = await request(app).get(`/jobs/${job.jobId}`);
    expect(statusResponse.body.status).toBe("cancelled");
  });
});
