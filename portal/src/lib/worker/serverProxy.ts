import { NextResponse } from "next/server";

const DEFAULT_WORKER_NODE_URL = "http://localhost:8081";

export function getWorkerNodeUrl() {
  return (process.env.WORKER_NODE_URL ?? DEFAULT_WORKER_NODE_URL).replace(/\/+$/, "");
}

export async function proxyWorkerRequest(path: string, init: RequestInit = {}) {
  try {
    const workerResponse = await fetch(`${getWorkerNodeUrl()}${path}`, {
      ...init,
      cache: "no-store",
    });
    const body = await workerResponse.text();

    return new Response(body, {
      status: workerResponse.status,
      headers: {
        "Content-Type": workerResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "worker_unavailable" }, { status: 502 });
  }
}
