import { errorJson } from "@/lib/http/errors";
import { logDebug, logWarn } from "@/lib/serverLogger";

const DEFAULT_WORKER_NODE_URL = "http://localhost:8081";

export function getWorkerNodeUrl() {
  return (process.env.WORKER_NODE_URL ?? DEFAULT_WORKER_NODE_URL).replace(/\/+$/, "");
}

export async function proxyWorkerRequest(path: string, init: RequestInit = {}) {
  const workerUrl = `${getWorkerNodeUrl()}${path}`;

  try {
    logDebug("proxy worker request", {
      path,
      method: init.method ?? "GET",
      workerUrl,
    });

    const workerResponse = await fetch(workerUrl, {
      ...init,
      cache: "no-store",
    });
    const body = await workerResponse.text();

    if (!workerResponse.ok) {
      // Metadata only — never log response/request bodies (AGENTS.md).
      logWarn("proxy worker response failed", {
        path,
        method: init.method ?? "GET",
        status: workerResponse.status,
      });

      if (!hasErrorEnvelope(body)) {
        return errorJson({
          code: workerResponse.status === 404 ? "NOT_FOUND" : "WORKER_ERROR",
          message:
            workerResponse.status === 404
              ? "Worker endpoint unavailable. Restart the worker and try again."
              : "Worker request failed. Please try again.",
          status: workerResponse.status,
          logMeta: {
            path,
            method: init.method ?? "GET",
            workerUrl,
            workerStatus: workerResponse.status,
          },
        });
      }
    }

    return new Response(body, {
      status: workerResponse.status,
      headers: {
        "Content-Type": workerResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return errorJson({
      code: "SERVICE_UNAVAILABLE",
      message: "Worker service unavailable. Start the worker and try again.",
      status: 503,
      details: error instanceof Error ? error.message : "unknown_error",
      logMeta: { path, method: init.method ?? "GET", workerUrl },
    });
  }
}

function hasErrorEnvelope(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return (
      !!parsed.error &&
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      "message" in parsed.error
    );
  } catch {
    return false;
  }
}
