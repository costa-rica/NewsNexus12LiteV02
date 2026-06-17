import {
  complete,
  fail,
  type JobRecord,
  markRunning,
  setResults,
  updateProgress,
} from "../../jobs/registry.js";
import { logError, logInfo } from "../../logger.js";
import { buildClassifierInput } from "./inputText.js";
import {
  createEmptyLocationSummary,
  type LocationArticleInput,
  type LocationClassifier,
  type LocationResults,
  type LocationScore,
  US_LABEL,
} from "./types.js";

interface RunLocationJobArgs {
  job: JobRecord<LocationResults>;
  articles: LocationArticleInput[];
  classifier: LocationClassifier;
}

/**
 * Orchestrate the load -> classify -> write steps (mirrors worker-python's
 * location_scorer). Runs sequentially, honours cancellation, and never partially
 * writes when classification fails.
 */
export async function runLocationJob({
  job,
  articles,
  classifier,
}: RunLocationJobArgs): Promise<void> {
  const signal = job.abortController.signal;
  const summary = createEmptyLocationSummary();
  const scores: LocationScore[] = [];
  const skippedIds: string[] = [];

  try {
    markRunning(job);

    // load step: eligible = has usable text and not already rated; skipped = no text.
    const eligible: { id: string; text: string }[] = [];
    for (const article of articles) {
      if (typeof article.locationRating === "number") {
        continue; // already rated on a previous run — leave untouched
      }

      const input = buildClassifierInput(article);
      if (input.eligible) {
        eligible.push({ id: article.id, text: input.text });
      } else {
        skippedIds.push(article.id);
      }
    }
    summary.eligible = eligible.length;
    summary.skipped = skippedIds.length;
    updateProgress(job, 0, { ...summary });

    if (signal.aborted) {
      return;
    }

    // model load step (distinct UI state).
    summary.modelLoading = 1;
    updateProgress(job, 0, { ...summary });
    await classifier.load();
    summary.modelLoading = 0;
    updateProgress(job, 0, { ...summary });

    // classify step.
    for (const item of eligible) {
      if (signal.aborted) {
        return;
      }

      const score = await classifier.score(item.text);
      scores.push({ article_id: item.id, score, rating_for: US_LABEL });
      summary.processed = scores.length;
      updateProgress(job, scores.length, { ...summary });
    }

    if (signal.aborted) {
      return;
    }

    // write step.
    setResults(job, { scores, skippedIds });
    complete(job, { ...summary });
    logInfo("location job completed", {
      jobId: job.jobId,
      eligible: summary.eligible,
      processed: summary.processed,
      skipped: summary.skipped,
    });
  } catch (error) {
    logError("location job failed", {
      jobId: job.jobId,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    fail(job, error);
  }
}
