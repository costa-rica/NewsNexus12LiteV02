import {
  cancel,
  complete,
  fail,
  type JobRecord,
  type JobSummary,
  markRunning,
  setResults,
  updateProgress,
} from "./registry.js";
import { logDebug, logError, logInfo, logWarn } from "../logger.js";

export interface RunJobOptions<TItem, TResult, TResults = TResult[]> {
  job: JobRecord<TResults>;
  items: TItem[];
  processItem: (item: TItem, signal: AbortSignal, index: number) => Promise<TResult>;
  collectResults?: (results: TResult[]) => TResults;
  summarizeResults?: (results: TResult[]) => JobSummary;
}

export async function runJob<TItem, TResult, TResults = TResult[]>({
  job,
  items,
  processItem,
  collectResults,
  summarizeResults,
}: RunJobOptions<TItem, TResult, TResults>) {
  const results: TResult[] = [];

  try {
    markRunning(job);
    logInfo("job started", {
      jobId: job.jobId,
      workflow: job.workflow,
      total: job.total,
    });

    for (const [index, item] of items.entries()) {
      throwIfCancelled(job.abortController.signal);

      const result = await processItem(item, job.abortController.signal, index);
      results.push(result);
      const summary = summarizeResults?.(results);
      updateProgress(job, results.length, summary);
      logDebug("job item processed", {
        jobId: job.jobId,
        workflow: job.workflow,
        processed: results.length,
        total: job.total,
        ...summarizeResultForLog(result),
      });
    }

    const collectedResults = collectResults
      ? collectResults(results)
      : (results as TResults);
    setResults(job, collectedResults);
    complete(job, summarizeResults?.(results));
    logInfo("job completed", {
      jobId: job.jobId,
      workflow: job.workflow,
      processed: job.processed,
      total: job.total,
      summary: job.summary,
    });
  } catch (error) {
    if (job.abortController.signal.aborted || error instanceof JobCancelledError) {
      cancel(job);
      logWarn("job cancelled", {
        jobId: job.jobId,
        workflow: job.workflow,
        processed: job.processed,
        total: job.total,
      });
      return;
    }

    fail(job, error);
    logError("job failed", {
      jobId: job.jobId,
      workflow: job.workflow,
      processed: job.processed,
      total: job.total,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

export class JobCancelledError extends Error {
  constructor() {
    super("Job cancelled.");
  }
}

export function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new JobCancelledError();
  }
}

function summarizeResultForLog(result: unknown) {
  if (!result || typeof result !== "object") {
    return {};
  }

  const record = result as Record<string, unknown>;

  return {
    articleId: record.articleId,
    status: record.status,
    failureType: record.failureType,
    bodySource: record.bodySource,
    extractionSource: record.extractionSource,
    googleStatusCode: record.googleStatusCode,
    publisherStatusCode: record.publisherStatusCode,
  };
}
