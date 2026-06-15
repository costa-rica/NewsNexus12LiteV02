import { Router } from "express";

import { cancel, getJob, toJobSnapshot } from "./registry.js";

export const jobRouter = Router();

jobRouter.get("/jobs/:jobId", (request, response) => {
  const job = getJob(request.params.jobId);

  if (!job) {
    response.status(404).json({ error: "job_not_found" });
    return;
  }

  response.json(toJobSnapshot(job));
});

jobRouter.post("/jobs/:jobId/cancel", (request, response) => {
  const job = getJob(request.params.jobId);

  if (!job) {
    response.status(404).json({ error: "job_not_found" });
    return;
  }

  response.json(toJobSnapshot(cancel(job)));
});
