import { NextResponse } from "next/server";

import { logError } from "@/lib/serverLogger";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    status: number;
  };
}

interface ErrorJsonArgs {
  code: string;
  message: string;
  status: number;
  details?: unknown;
  logMeta?: Record<string, unknown>;
}

/**
 * Build the standard error envelope (docs/ERROR_REQUIREMENTS.md) for a portal
 * route handler. Logs the failure server-side (metadata only) and exposes
 * `details` only in development.
 */
export function errorJson(args: ErrorJsonArgs) {
  logError("api error", {
    code: args.code,
    status: args.status,
    ...(args.logMeta ?? {}),
  });

  const body: ApiErrorBody = {
    error: { code: args.code, message: args.message, status: args.status },
  };

  if (args.details !== undefined && process.env.NODE_ENV === "development") {
    body.error.details = args.details;
  }

  return NextResponse.json(body, { status: args.status });
}
