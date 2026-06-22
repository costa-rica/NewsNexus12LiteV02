import { proxyWorkerRequest } from "@/lib/worker/serverProxy";

export async function POST(request: Request) {
  const body = await request.text();

  return proxyWorkerRequest("/semantic-scorer/start-job", {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") ?? "application/json",
    },
    body,
  });
}
