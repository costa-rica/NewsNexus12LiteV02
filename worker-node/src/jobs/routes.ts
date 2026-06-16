import { Router } from "express";

import { sendError } from "../http/errors.js";
import { cancel, getJob, toJobSnapshot } from "./registry.js";

export const jobRouter = Router();

jobRouter.get("/jobs/:jobId", (request, response) => {
  const job = getJob(request.params.jobId);

  if (!job) {
    sendError(response, {
      code: "NOT_FOUND",
      message: "Job not found",
      status: 404,
      logMeta: { jobId: request.params.jobId },
    });
    return;
  }

  response.json(toJobSnapshot(job));
});

jobRouter.post("/jobs/:jobId/cancel", (request, response) => {
  const job = getJob(request.params.jobId);

  if (!job) {
    sendError(response, {
      code: "NOT_FOUND",
      message: "Job not found",
      status: 404,
      logMeta: { jobId: request.params.jobId },
    });
    return;
  }

  response.json(toJobSnapshot(cancel(job)));
});
