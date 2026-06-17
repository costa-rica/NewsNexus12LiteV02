import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function routeContext(jobId: string) {
  return {
    params: Promise.resolve({ jobId }),
  };
}

describe("POST /api/worker/jobs/:jobId/cancel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards cancellation requests to worker-node", async () => {
    vi.stubEnv("WORKER_NODE_URL", "http://worker.test");
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: "job-1", status: "cancelled" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const response = await POST(
      new Request("http://localhost/api/worker/jobs/job-1/cancel", {
        method: "POST",
      }),
      routeContext("job-1"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "cancelled" });
    expect(fetch).toHaveBeenCalledWith("http://worker.test/jobs/job-1/cancel", {
      method: "POST",
      cache: "no-store",
    });
  });
});
