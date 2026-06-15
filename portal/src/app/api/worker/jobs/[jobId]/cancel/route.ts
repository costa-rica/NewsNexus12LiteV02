import { proxyWorkerRequest } from "@/lib/worker/serverProxy";

interface JobCancelRouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

export async function POST(_request: Request, { params }: JobCancelRouteContext) {
  const { jobId } = await params;

  return proxyWorkerRequest(`/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
}
