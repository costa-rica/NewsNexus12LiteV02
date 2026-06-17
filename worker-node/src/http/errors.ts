import type { NextFunction, Request, Response } from "express";

import { logError } from "../logger.js";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    status: number;
  };
}

export class HttpError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Build the standard error envelope per docs/ERROR_REQUIREMENTS.md. `details` is
 * only exposed when running in development; never leak internals otherwise.
 */
export function buildErrorBody(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): ApiErrorBody {
  const body: ApiErrorBody = { error: { code, message, status } };
  if (details !== undefined && process.env.NODE_ENV === "development") {
    body.error.details = details;
  }
  return body;
}

interface SendErrorArgs {
  code: string;
  message: string;
  status: number;
  details?: unknown;
  logMeta?: Record<string, unknown>;
}

export function sendError(response: Response, args: SendErrorArgs) {
  logError("request error", {
    code: args.code,
    status: args.status,
    ...(args.logMeta ?? {}),
  });
  response.status(args.status).json(
    buildErrorBody(args.code, args.message, args.status, args.details),
  );
}

export function errorMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    sendError(response, {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    });
    return;
  }

  sendError(response, {
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    status: 500,
    details: error instanceof Error ? error.message : String(error),
  });
}
