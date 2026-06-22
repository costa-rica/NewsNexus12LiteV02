import {
  complete,
  fail,
  type JobRecord,
  markRunning,
  setResults,
  updateProgress,
} from "../../jobs/registry.js";
import { logError, logInfo } from "../../logger.js";
import { pickArticleText } from "./inputText.js";
import {
  createEmptySemanticSummary,
  type SemanticArticleInput,
  type SemanticFailure,
  type SemanticResults,
  type SemanticScore,
  type SemanticScorer,
} from "./types.js";

interface RunSemanticJobArgs {
  job: JobRecord<SemanticResults>;
  articles: SemanticArticleInput[];
  keywords: string[];
  scorer: SemanticScorer;
}

export async function runSemanticJob({
  job,
  articles,
  keywords,
  scorer,
}: RunSemanticJobArgs): Promise<void> {
  const signal = job.abortController.signal;
  const summary = createEmptySemanticSummary();
  const scores: SemanticScore[] = [];
  const skippedIds: string[] = [];
  const failures: SemanticFailure[] = [];

  try {
    markRunning(job);

    const eligible: { id: string; text: string }[] = [];
    for (const article of articles) {
      if (
        typeof article.semanticRatingMax === "number" ||
        typeof article.semanticRating === "number"
      ) {
        continue;
      }

      const text = pickArticleText(article);
      if (text) {
        eligible.push({ id: article.id, text });
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

    summary.modelLoading = 1;
    updateProgress(job, 0, { ...summary });
    await scorer.load();
    summary.modelLoading = 0;
    updateProgress(job, 0, { ...summary });

    for (const item of eligible) {
      if (signal.aborted) {
        return;
      }

      try {
        const result = await scorer.score(item.text, keywords);

        if (!result) {
          skippedIds.push(item.id);
          summary.skipped += 1;
          updateProgress(job, scores.length, { ...summary });
          continue;
        }

        scores.push({
          article_id: item.id,
          score: result.score,
          rating_for: result.label,
        });
        summary.processed = scores.length;
        updateProgress(job, scores.length, { ...summary });
      } catch (error) {
        failures.push({ article_id: item.id, reason: "error" });
        summary.failed += 1;
        updateProgress(job, scores.length, { ...summary });
        logError("semantic article score failed", {
          jobId: job.jobId,
          articleId: item.id,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    if (signal.aborted) {
      return;
    }

    setResults(job, { scores, skippedIds, failures });
    complete(job, { ...summary });
    logInfo("semantic job completed", {
      jobId: job.jobId,
      eligible: summary.eligible,
      processed: summary.processed,
      skipped: summary.skipped,
      failed: summary.failed,
    });
  } catch (error) {
    logError("semantic job failed", {
      jobId: job.jobId,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    fail(job, error);
  }
}
