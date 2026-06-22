import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/worker/semantic-scorer/start-job", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards semantic start-job requests to worker-node", async () => {
    vi.stubEnv("WORKER_NODE_URL", "http://worker.test");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jobId: "job-1",
          status: "queued",
          endpointName: "semantic-scorer",
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

    const body = { articles: [{ id: "a1" }], keywords: ["fire hazard"] };
    const response = await POST(
      new Request("http://localhost/api/worker/semantic-scorer/start-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      jobId: "job-1",
      endpointName: "semantic-scorer",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://worker.test/semantic-scorer/start-job",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
  });
});
