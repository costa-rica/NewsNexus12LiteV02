import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkerRequest, WorkerResponse } from "./classifier.worker.types.js";
import { createThreadLocationClassifier } from "./threadClassifier.js";

class FakeWorker extends EventEmitter {
  readonly postMessage = vi.fn<(message: WorkerRequest) => void>();

  emitMessage(message: WorkerResponse): void {
    this.emit("message", message);
  }

  emitWorkerError(error: Error): void {
    this.emit("error", error);
  }

  emitExit(code: number): void {
    this.emit("exit", code);
  }
}

function createHarness() {
  const workers: FakeWorker[] = [];
  const workerUrls: URL[] = [];
  const classifier = createThreadLocationClassifier(
    { model: "Xenova/bart-large-mnli", dtype: "q8" },
    {
      workerFactory: (url) => {
        workerUrls.push(url);
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    },
  );

  return { classifier, workers, workerUrls };
}

function deferredTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("createThreadLocationClassifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves load on a loaded worker response", async () => {
    const { classifier, workers } = createHarness();

    const loaded = classifier.load();
    expect(workers).toHaveLength(1);
    expect(workers[0]?.postMessage).toHaveBeenCalledWith({ type: "load" });

    workers[0]?.emitMessage({ type: "loaded" });

    await expect(loaded).resolves.toBeUndefined();
  });

  it("posts score requests and resolves matching score results", async () => {
    const { classifier, workers } = createHarness();

    const score = classifier.score("A story in Washington, D.C.");

    expect(workers).toHaveLength(1);
    expect(workers[0]?.postMessage).toHaveBeenCalledWith({
      type: "score",
      id: "1",
      text: "A story in Washington, D.C.",
    });

    workers[0]?.emitMessage({ type: "score-result", id: "1", score: 0.82 });

    await expect(score).resolves.toBe(0.82);
  });

  it("correlates out-of-order score results by id", async () => {
    const { classifier, workers } = createHarness();

    const first = classifier.score("first");
    const second = classifier.score("second");

    workers[0]?.emitMessage({ type: "score-result", id: "2", score: 0.2 });
    workers[0]?.emitMessage({ type: "score-result", id: "1", score: 0.1 });

    await expect(first).resolves.toBe(0.1);
    await expect(second).resolves.toBe(0.2);
  });

  it("routes worker error messages by id only to the matching score promise", async () => {
    const { classifier, workers } = createHarness();

    const score = classifier.score("bad score");
    workers[0]?.emitMessage({ type: "error", id: "1", message: "score failed" });

    await expect(score).rejects.toThrow("score failed");
  });

  it("rejects an in-flight load on a no-id error without rejecting scores", async () => {
    const { classifier, workers } = createHarness();

    const load = classifier.load();
    const score = classifier.score("still pending");

    workers[0]?.emitMessage({ type: "error", message: "load failed" });
    await expect(load).rejects.toThrow("load failed");

    workers[0]?.emitMessage({ type: "score-result", id: "1", score: 0.7 });
    await expect(score).resolves.toBe(0.7);
  });

  it("rejects all outstanding promises on worker error", async () => {
    const { classifier, workers } = createHarness();

    const load = classifier.load();
    const firstScore = classifier.score("first");
    const secondScore = classifier.score("second");

    workers[0]?.emitWorkerError(new Error("worker crashed"));

    await expect(load).rejects.toThrow("worker crashed");
    await expect(firstScore).rejects.toThrow("worker crashed");
    await expect(secondScore).rejects.toThrow("worker crashed");
  });

  it("rejects all outstanding promises on worker exit", async () => {
    const { classifier, workers } = createHarness();

    const load = classifier.load();
    const score = classifier.score("pending");

    workers[0]?.emitExit(1);

    await expect(load).rejects.toThrow("exited with code 1");
    await expect(score).rejects.toThrow("exited with code 1");
  });

  it("posts one load request for overlapping load callers and resolves both", async () => {
    const { classifier, workers } = createHarness();

    const warmupLoad = classifier.load();
    const jobLoad = classifier.load();

    expect(warmupLoad).toBe(jobLoad);
    expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1);
    expect(workers[0]?.postMessage).toHaveBeenCalledWith({ type: "load" });

    workers[0]?.emitMessage({ type: "loaded" });

    await expect(warmupLoad).resolves.toBeUndefined();
    await expect(jobLoad).resolves.toBeUndefined();
  });

  it("rejects overlapping load callers with the same no-id error", async () => {
    const { classifier, workers } = createHarness();

    const warmupLoad = classifier.load();
    const jobLoad = classifier.load();
    const score = classifier.score("not load related");

    workers[0]?.emitMessage({ type: "error", message: "load failed" });

    const [warmupResult, jobResult] = await Promise.allSettled([
      warmupLoad,
      jobLoad,
    ]);
    expect(warmupResult.status).toBe("rejected");
    expect(jobResult.status).toBe("rejected");
    if (warmupResult.status === "rejected" && jobResult.status === "rejected") {
      expect(warmupResult.reason).toBe(jobResult.reason);
    }

    workers[0]?.emitMessage({ type: "score-result", id: "1", score: 0.4 });
    await expect(score).resolves.toBe(0.4);
  });

  it("clears failed load state so a later load retries lazily", async () => {
    const { classifier, workers } = createHarness();

    const failedLoad = classifier.load();
    workers[0]?.emitMessage({ type: "error", message: "load failed" });
    await expect(failedLoad).rejects.toThrow("load failed");
    await deferredTick();

    const retriedLoad = classifier.load();
    expect(workers).toHaveLength(1);
    expect(workers[0]?.postMessage).toHaveBeenCalledTimes(2);
    expect(workers[0]?.postMessage).toHaveBeenLastCalledWith({ type: "load" });

    workers[0]?.emitMessage({ type: "loaded" });
    await expect(retriedLoad).resolves.toBeUndefined();
  });

  it("re-spawns and reloads after worker exit during load", async () => {
    const { classifier, workers } = createHarness();

    const failedLoad = classifier.load();
    workers[0]?.emitExit(1);
    await expect(failedLoad).rejects.toThrow("exited with code 1");

    const retriedLoad = classifier.load();
    expect(workers).toHaveLength(2);
    expect(workers[1]?.postMessage).toHaveBeenCalledWith({ type: "load" });

    workers[1]?.emitMessage({ type: "loaded" });
    await expect(retriedLoad).resolves.toBeUndefined();
  });

  it("keeps successful load calls as no-ops while the worker is alive", async () => {
    const { classifier, workers } = createHarness();

    const firstLoad = classifier.load();
    workers[0]?.emitMessage({ type: "loaded" });
    await firstLoad;

    await expect(classifier.load()).resolves.toBeUndefined();
    expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1);
  });
});
