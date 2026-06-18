import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { logError, logInfo } from "../../logger.js";
import type { LocationScorerConfig } from "./config.js";
import type { WorkerRequest, WorkerResponse } from "./classifier.worker.types.js";
import type { LocationClassifier } from "./types.js";

type Deferred<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type WorkerFactory = (url: URL) => Worker;

interface ThreadLocationClassifierOptions {
  workerFactory?: WorkerFactory;
}

export function createThreadLocationClassifier(
  _config: LocationScorerConfig,
  options: ThreadLocationClassifierOptions = {},
): LocationClassifier {
  const workerFactory =
    options.workerFactory ??
    ((url: URL) => {
      return new Worker(url);
    });

  let worker: Worker | null = null;
  let nextScoreId = 1;
  let loadPromise: Promise<void> | null = null;
  let loadDeferred: Deferred<void> | null = null;
  const pendingScores = new Map<string, Deferred<number>>();

  function ensureWorker(): Worker {
    if (worker) {
      return worker;
    }

    const nextWorker = workerFactory(resolveWorkerUrl());
    worker = nextWorker;

    nextWorker.on("message", (message: WorkerResponse) => {
      handleWorkerMessage(message);
    });
    nextWorker.on("error", (error) => {
      failWorker(error instanceof Error ? error : new Error(String(error)), "error");
    });
    nextWorker.on("exit", (code) => {
      if (worker === nextWorker) {
        failWorker(new Error(`Location classifier worker exited with code ${code}`), "exit");
      }
    });

    logInfo("location classifier worker spawned");
    return nextWorker;
  }

  function handleWorkerMessage(message: WorkerResponse): void {
    if (message.type === "loaded") {
      const deferred = loadDeferred;
      loadDeferred = null;
      deferred?.resolve(undefined);
      return;
    }

    if (message.type === "score-result") {
      const deferred = pendingScores.get(message.id);
      if (!deferred) {
        return;
      }
      pendingScores.delete(message.id);
      deferred.resolve(message.score);
      return;
    }

    const error = new Error(message.message);
    if (message.id) {
      const deferred = pendingScores.get(message.id);
      if (!deferred) {
        return;
      }
      pendingScores.delete(message.id);
      deferred.reject(error);
      return;
    }

    const deferred = loadDeferred;
    loadDeferred = null;
    deferred?.reject(error);
  }

  function failWorker(error: Error, event: "error" | "exit"): void {
    logError("location classifier worker failed", {
      event,
      pendingScores: pendingScores.size,
      loadInFlight: loadDeferred !== null,
      reason: error.message,
    });

    const activeWorker = worker;
    worker = null;
    loadPromise = null;

    if (activeWorker) {
      activeWorker.removeAllListeners();
    }

    const deferredLoad = loadDeferred;
    loadDeferred = null;
    deferredLoad?.reject(error);

    for (const deferred of pendingScores.values()) {
      deferred.reject(error);
    }
    pendingScores.clear();
  }

  return {
    load() {
      if (loadPromise) {
        return loadPromise;
      }

      const activeWorker = ensureWorker();
      const promise = new Promise<void>((resolve, reject) => {
        loadDeferred = { resolve, reject };
        postWorkerMessage(activeWorker, { type: "load" });
      });

      loadPromise = promise;
      void promise.catch(() => {
        if (loadPromise === promise) {
          loadPromise = null;
        }
      });

      return promise;
    },

    score(text: string) {
      const activeWorker = ensureWorker();
      const id = String(nextScoreId);
      nextScoreId += 1;

      return new Promise<number>((resolve, reject) => {
        pendingScores.set(id, { resolve, reject });
        postWorkerMessage(activeWorker, { type: "score", id, text });
      });
    },
  };
}

function postWorkerMessage(worker: Worker, message: WorkerRequest): void {
  worker.postMessage(message);
}

function resolveWorkerUrl(): URL {
  const currentPath = fileURLToPath(import.meta.url);
  const extension = currentPath.endsWith(".ts") ? ".ts" : ".js";
  return new URL(`./classifier.worker${extension}`, import.meta.url);
}
