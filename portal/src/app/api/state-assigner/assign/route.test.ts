import { afterEach, describe, expect, it, vi } from "vitest";

import { logError, logInfo, logWarn } from "@/lib/serverLogger";

import { POST } from "./route";

vi.mock("@/lib/serverLogger", () => ({
  logDebug: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

const originalKey = process.env.KEY_OPEN_AI;

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/state-assigner/assign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    promptTemplate:
      "Title: {articleTitle}\nContent: {articleContent}\nReturn JSON only.",
    title: "Wildfire in Los Angeles",
    content: "Evacuations are underway in Los Angeles, California.",
    ...overrides,
  };
}

function mockOpenAiResponse(response: Response | Promise<Response>) {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("POST /api/state-assigner/assign", () => {
  afterEach(() => {
    process.env.KEY_OPEN_AI = originalKey;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns a normalized state assignment for a valid completion", async () => {
    process.env.KEY_OPEN_AI = "sk-test-secret";
    const fetch = mockOpenAiResponse(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  occuredInTheUS: true,
                  reasoning: "The article names Los Angeles, California.",
                  state: "CA",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const response = await POST(makeRequest(validBody()));
    const body = await response.json();
    const openAiBody = JSON.parse(
      String(fetch.mock.calls[0][1]?.body),
    ) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      occuredInTheUS: true,
      reasoning: "The article names Los Angeles, California.",
      stateName: "California",
      rawStateText: "CA",
      resultStatus: "assigned",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-secret",
        }),
      }),
    );
    expect(openAiBody).toMatchObject({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: expect.stringContaining("Wildfire in Los Angeles"),
        },
      ],
      temperature: 0.3,
    });
    expect(openAiBody).not.toHaveProperty("response_format");
  });

  it("returns SERVICE_UNAVAILABLE when KEY_OPEN_AI is missing", async () => {
    process.env.KEY_OPEN_AI = "";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await POST(makeRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE", status: 503 },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR for an empty prompt template", async () => {
    process.env.KEY_OPEN_AI = "sk-test-secret";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await POST(makeRequest(validBody({ promptTemplate: " " })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "VALIDATION_ERROR", status: 400 },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an article-level failed assignment on timeout", async () => {
    process.env.KEY_OPEN_AI = "sk-test-secret";
    const fetch = vi.fn().mockRejectedValue(new DOMException("abort", "AbortError"));
    vi.stubGlobal("fetch", fetch);

    const response = await POST(makeRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      resultStatus: "failed",
      errorMessage: "State assignment timed out.",
    });
  });

  it("returns an article-level failed assignment for OpenAI non-2xx responses", async () => {
    process.env.KEY_OPEN_AI = "sk-test-secret";
    mockOpenAiResponse(new Response("rate limited", { status: 429 }));

    const response = await POST(makeRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      resultStatus: "failed",
      errorMessage: "State assignment provider returned an error.",
    });
  });

  it("does not log secrets, article bodies, prompts, or raw responses", async () => {
    process.env.KEY_OPEN_AI = "sk-test-secret";
    mockOpenAiResponse(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"occuredInTheUS":true,"reasoning":"sensitive raw reasoning","state":"California"}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await POST(
      makeRequest(
        validBody({
          promptTemplate: "secret prompt {articleTitle} {articleContent}",
          content: "sensitive article content",
        }),
      ),
    );

    const logged = JSON.stringify([
      vi.mocked(logInfo).mock.calls,
      vi.mocked(logWarn).mock.calls,
      vi.mocked(logError).mock.calls,
    ]);

    expect(logged).not.toContain("sk-test-secret");
    expect(logged).not.toContain("secret prompt");
    expect(logged).not.toContain("sensitive article content");
    expect(logged).not.toContain("sensitive raw reasoning");
  });
});
