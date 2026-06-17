import { proxyWorkerRequest } from "@/lib/worker/serverProxy";

export async function POST(request: Request) {
  const body = await request.text();

  return proxyWorkerRequest("/article-content-scraper-02/start-job", {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") ?? "application/json",
    },
    body,
  });
}
