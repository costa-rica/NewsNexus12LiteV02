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
