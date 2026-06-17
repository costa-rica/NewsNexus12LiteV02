import { proxyWorkerRequest } from "@/lib/worker/serverProxy";

interface JobRouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

export async function GET(_request: Request, { params }: JobRouteContext) {
  const { jobId } = await params;

  return proxyWorkerRequest(`/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
}
