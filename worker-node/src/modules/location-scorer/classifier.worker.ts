import { logError, logInfo } from "../../logger.js";
import { parentPort } from "node:worker_threads";

import type { WorkerRequest, WorkerResponse } from "./classifier.worker.types.js";

if (!parentPort) {
  throw new Error("location classifier worker requires parentPort");
}

const port = parentPort;

async function createClassifier() {
  const [{ createUsLocationClassifier }, { loadLocationScorerConfig }] =
    await Promise.all([import("./classifier.js"), import("./config.js")]);

  return createUsLocationClassifier(loadLocationScorerConfig());
}

const classifierPromise = createClassifier();

port.on("message", (message: WorkerRequest) => {
  void handleMessage(message);
});

async function handleMessage(message: WorkerRequest): Promise<void> {
  if (message.type === "load") {
    await handleLoad();
    return;
  }

  await handleScore(message.id, message.text);
}

async function handleLoad(): Promise<void> {
  try {
    logInfo("location classifier worker load started");
    const classifier = await classifierPromise;
    await classifier.load();
    postResponse({ type: "loaded" });
    logInfo("location classifier worker load completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    logError("location classifier worker load failed", { reason: message });
    postResponse({ type: "error", message });
  }
}

async function handleScore(id: string, text: string): Promise<void> {
  try {
    const classifier = await classifierPromise;
    const score = await classifier.score(text);
    postResponse({ type: "score-result", id, score });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    logError("location classifier worker score failed", { id, reason: message });
    postResponse({ type: "error", id, message });
  }
}

function postResponse(response: WorkerResponse): void {
  port.postMessage(response);
}
