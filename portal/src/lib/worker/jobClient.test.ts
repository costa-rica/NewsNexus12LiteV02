import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelJob,
  pollJob,
  startJob,
  WorkerRequestError,
} from "./jobClient";

function mockJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("worker job client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts a workflow through the portal route only", async () => {
    const fetch = vi.fn().mockResolvedValue(
      mockJsonResponse({
        jobId: "job-1",
        status: "queued",
        endpointName: "article-content-scraper-02",
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const response = await startJob("article-content-scraper-02", { articles: [] });

    expect(response.jobId).toBe("job-1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/worker/article-content-scraper-02/start-job",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ articles: [] }),
      }),
    );
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain("8081");
  });

  it("surfaces the worker error envelope code and message", async () => {
    const fetch = vi.fn().mockResolvedValue(
      mockJsonResponse(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Worker service unavailable. Start the worker and try again.",
            status: 503,
          },
        },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(startJob("article-content-scraper-02", { articles: [] })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      message: "Worker service unavailable. Start the worker and try again.",
    } satisfies Partial<WorkerRequestError>);
  });

  it("polls until a terminal completed status and emits updates", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          jobId: "job-1",
          workflow: "scrape",
          endpointName: "scrape",
          status: "running",
          processed: 0,
          total: 1,
          summary: {},
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          jobId: "job-1",
          workflow: "scrape",
          endpointName: "scrape",
          status: "completed",
          processed: 1,
          total: 1,
          summary: {},
          results: [{ articleId: "a1" }],
        }),
      );
    const updates: string[] = [];
    vi.stubGlobal("fetch", fetch);

    const job = await pollJob("job-1", {
      intervalMs: 0,
      onUpdate: (update) => updates.push(update.status),
    });

    expect(job.status).toBe("completed");
    expect(updates).toEqual(["running", "completed"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries transient 502 and 504 poll failures before surfacing updates", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            error: {
              code: "BAD_GATEWAY",
              message: "Bad gateway",
              status: 502,
            },
          },
          { status: 502 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            error: {
              code: "GATEWAY_TIMEOUT",
              message: "Gateway timeout",
              status: 504,
            },
          },
          { status: 504 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          jobId: "job-1",
          workflow: "scrape",
          endpointName: "scrape",
          status: "completed",
          processed: 1,
          total: 1,
          summary: {},
        }),
      );
    const updates: string[] = [];
    vi.stubGlobal("fetch", fetch);

    const job = await pollJob("job-1", {
      intervalMs: 0,
      onUpdate: (update) => updates.push(update.status),
    });

    expect(job.status).toBe("completed");
    expect(updates).toEqual(["completed"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries fetch failed poll errors and recovers", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        mockJsonResponse({
          jobId: "job-1",
          workflow: "scrape",
          endpointName: "scrape",
          status: "completed",
          processed: 1,
          total: 1,
          summary: {},
        }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(pollJob("job-1", { intervalMs: 0 })).resolves.toMatchObject({
      status: "completed",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("surfaces non-transient poll errors immediately", async () => {
    const fetch = vi.fn().mockResolvedValue(
      mockJsonResponse(
        {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
            status: 404,
          },
        },
        { status: 404 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(pollJob("job-1", { intervalMs: 0 })).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    } satisfies Partial<WorkerRequestError>);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats failed and cancelled as terminal statuses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          jobId: "job-1",
          workflow: "scrape",
          endpointName: "scrape",
          status: "failed",
          processed: 1,
          total: 1,
          summary: {},
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          jobId: "job-2",
          workflow: "scrape",
          endpointName: "scrape",
          status: "cancelled",
          processed: 0,
          total: 1,
          summary: {},
        }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(pollJob("job-1", { intervalMs: 0 })).resolves.toMatchObject({
      status: "failed",
    });
    await expect(pollJob("job-2", { intervalMs: 0 })).resolves.toMatchObject({
      status: "cancelled",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels a job through the portal route", async () => {
    const fetch = vi.fn().mockResolvedValue(
      mockJsonResponse({
        jobId: "job-1",
        workflow: "scrape",
        endpointName: "scrape",
        status: "cancelled",
        processed: 0,
        total: 1,
        summary: {},
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(cancelJob("job-1")).resolves.toMatchObject({ status: "cancelled" });
    expect(fetch).toHaveBeenCalledWith("/api/worker/jobs/job-1/cancel", {
      method: "POST",
    });
  });
});
