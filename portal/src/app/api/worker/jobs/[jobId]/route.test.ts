import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

function routeContext(jobId: string) {
  return {
    params: Promise.resolve({ jobId }),
  };
}

describe("GET /api/worker/jobs/:jobId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards job status requests to worker-node", async () => {
    vi.stubEnv("WORKER_NODE_URL", "http://worker.test/");
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: "job-1", status: "running" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const response = await GET(
      new Request("http://localhost/api/worker/jobs/job-1"),
      routeContext("job-1"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId: "job-1" });
    expect(fetch).toHaveBeenCalledWith("http://worker.test/jobs/job-1", {
      method: "GET",
      cache: "no-store",
    });
  });
});
