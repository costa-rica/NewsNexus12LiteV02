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

    for (const [index, item] of items.entries()) {
      throwIfCancelled(job.abortController.signal);

      const result = await processItem(item, job.abortController.signal, index);
      results.push(result);
      updateProgress(job, results.length, summarizeResults?.(results));
    }

    const collectedResults = collectResults
      ? collectResults(results)
      : (results as TResults);
    setResults(job, collectedResults);
    complete(job, summarizeResults?.(results));
  } catch (error) {
    if (job.abortController.signal.aborted || error instanceof JobCancelledError) {
      cancel(job);
      return;
    }

    fail(job, error);
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
