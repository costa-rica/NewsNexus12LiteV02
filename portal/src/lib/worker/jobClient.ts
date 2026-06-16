export type WorkerJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface WorkerJob<TResults = unknown, TSummary = Record<string, number>> {
  jobId: string;
  workflow: string;
  endpointName: string;
  status: WorkerJobStatus;
  processed: number;
  total: number;
  summary: TSummary;
  results?: TResults;
  error?: string;
}

export interface StartJobResponse {
  jobId: string;
  status: Extract<WorkerJobStatus, "queued">;
  endpointName: string;
}

export class WorkerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "WorkerRequestError";
  }
}

interface PollJobOptions<TResults, TSummary> {
  intervalMs?: number;
  maxAttempts?: number;
  onUpdate?: (job: WorkerJob<TResults, TSummary>) => void;
}

const TERMINAL_STATUSES = new Set<WorkerJobStatus>(["completed", "failed", "cancelled"]);

export async function startJob<TPayload>(
  endpoint: string,
  payload: TPayload,
): Promise<StartJobResponse> {
  const response = await fetch(`/api/worker/${endpoint}/start-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<StartJobResponse>(response);
}

export async function getJob<TResults = unknown, TSummary = Record<string, number>>(
  jobId: string,
): Promise<WorkerJob<TResults, TSummary>> {
  const response = await fetch(`/api/worker/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });

  return parseJsonResponse<WorkerJob<TResults, TSummary>>(response);
}

export async function pollJob<TResults = unknown, TSummary = Record<string, number>>(
  jobId: string,
  options: PollJobOptions<TResults, TSummary> = {},
): Promise<WorkerJob<TResults, TSummary>> {
  const intervalMs = options.intervalMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 120;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await getJob<TResults, TSummary>(jobId);
    options.onUpdate?.(job);

    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    await wait(intervalMs);
  }

  throw new Error("Timed out while polling worker job.");
}

export async function cancelJob<TResults = unknown, TSummary = Record<string, number>>(
  jobId: string,
): Promise<WorkerJob<TResults, TSummary>> {
  const response = await fetch(`/api/worker/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });

  return parseJsonResponse<WorkerJob<TResults, TSummary>>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as
    | T
    | { error?: { code?: string; message?: string } };

  if (!response.ok) {
    const envelope = (data as { error?: { code?: string; message?: string } })
      .error;
    const code = typeof envelope?.code === "string" ? envelope.code : undefined;
    const message =
      typeof envelope?.message === "string"
        ? envelope.message
        : "Worker request failed.";

    throw new WorkerRequestError(message, response.status, code);
  }

  return data as T;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
