import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/worker/location-scorer/start-job", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards location start-job requests to worker-node", async () => {
    vi.stubEnv("WORKER_NODE_URL", "http://worker.test");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jobId: "job-1",
          status: "queued",
          endpointName: "location-scorer",
        }),
        {
          status: 202,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const response = await POST(
      new Request("http://localhost/api/worker/location-scorer/start-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ articles: [{ id: "a1" }] }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      jobId: "job-1",
      endpointName: "location-scorer",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://worker.test/location-scorer/start-job",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ articles: [{ id: "a1" }] }),
        cache: "no-store",
      },
    );
  });
});
