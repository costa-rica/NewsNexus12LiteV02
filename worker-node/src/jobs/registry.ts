import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type JobSummary = Record<string, number>;

export interface JobSnapshot<TResults = unknown> {
  jobId: string;
  workflow: string;
  endpointName: string;
  status: JobStatus;
  processed: number;
  total: number;
  summary: JobSummary;
  results?: TResults;
  error?: string;
}

export interface JobRecord<TResults = unknown> extends JobSnapshot<TResults> {
  abortController: AbortController;
  createdAt: string;
  updatedAt: string;
}

interface CreateJobOptions {
  endpointName?: string;
  summary?: JobSummary;
}

const jobs = new Map<string, JobRecord>();

function touch<TResults>(job: JobRecord<TResults>) {
  job.updatedAt = new Date().toISOString();
  return job;
}

export function createJob<TResults = unknown>(
  workflow: string,
  total: number,
  options: CreateJobOptions = {},
): JobRecord<TResults> {
  const now = new Date().toISOString();
  const job: JobRecord<TResults> = {
    jobId: randomUUID(),
    workflow,
    endpointName: options.endpointName ?? workflow,
    status: "queued",
    processed: 0,
    total,
    summary: options.summary ?? {},
    abortController: new AbortController(),
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.jobId, job as JobRecord);

  return job;
}

export function getJob<TResults = unknown>(jobId: string) {
  return jobs.get(jobId) as JobRecord<TResults> | undefined;
}

export function markRunning<TResults>(job: JobRecord<TResults>) {
  if (job.status === "queued") {
    job.status = "running";
    touch(job);
  }
}

export function updateProgress<TResults>(
  job: JobRecord<TResults>,
  processed: number,
  summary?: JobSummary,
) {
  job.processed = processed;
  if (summary) {
    job.summary = summary;
  }
  touch(job);
}

export function setResults<TResults>(job: JobRecord<TResults>, results: TResults) {
  job.results = results;
  touch(job);
}

export function complete<TResults>(job: JobRecord<TResults>, summary?: JobSummary) {
  if (job.status === "cancelled") {
    return;
  }

  job.status = "completed";
  job.processed = job.total;
  if (summary) {
    job.summary = summary;
  }
  touch(job);
}

export function fail<TResults>(job: JobRecord<TResults>, error: unknown) {
  if (job.status === "cancelled") {
    return;
  }

  job.status = "failed";
  job.error = error instanceof Error ? error.message : "Job failed.";
  touch(job);
}

export function cancel<TResults>(job: JobRecord<TResults>) {
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return job;
  }

  job.abortController.abort();
  job.status = "cancelled";
  touch(job);

  return job;
}

export function toJobSnapshot<TResults>(job: JobRecord<TResults>): JobSnapshot<TResults> {
  return {
    jobId: job.jobId,
    workflow: job.workflow,
    endpointName: job.endpointName,
    status: job.status,
    processed: job.processed,
    total: job.total,
    summary: job.summary,
    results: job.results,
    error: job.error,
  };
}

export function clearJobsForTests() {
  jobs.clear();
}
