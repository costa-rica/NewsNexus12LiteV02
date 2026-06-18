export type WorkerRequest =
  | { type: "load" }
  | { type: "score"; id: string; text: string };

export type WorkerResponse =
  | { type: "loaded" }
  | { type: "score-result"; id: string; score: number }
  | { type: "error"; id?: string; message: string };
