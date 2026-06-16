import path from "node:path";

import { createLogger, format, transports, type Logger } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export type LogMode = "development" | "testing" | "production";

const VALID_MODES: LogMode[] = ["development", "testing", "production"];

export interface LoggerEnv {
  mode: LogMode;
  nameApp: string;
  pathToLogs: string;
  maxSize: number;
  maxFiles: number;
}

/**
 * Pure validation of the logging environment per docs/LOGGING_NODE_JS_V08.md.
 * Throws on any violation so callers can decide how to fail (the module wrapper
 * below turns a throw into a fatal stderr message + process.exit(1)).
 */
export function validateLoggerEnv(
  env: NodeJS.ProcessEnv = process.env,
): LoggerEnv {
  const nodeEnv = env.NODE_ENV;
  if (!nodeEnv) {
    throw new Error("Missing required env var NODE_ENV");
  }
  if (!VALID_MODES.includes(nodeEnv as LogMode)) {
    throw new Error(
      `Invalid NODE_ENV "${nodeEnv}" (expected development|testing|production)`,
    );
  }

  const nameApp = env.NAME_APP;
  if (!nameApp) {
    throw new Error("Missing required env var NAME_APP");
  }

  const pathToLogs = env.PATH_TO_LOGS;
  if (!pathToLogs) {
    throw new Error("Missing required env var PATH_TO_LOGS");
  }
  if (!path.isAbsolute(pathToLogs)) {
    throw new Error(
      `PATH_TO_LOGS must be an absolute path (received "${pathToLogs}")`,
    );
  }

  return {
    mode: nodeEnv as LogMode,
    nameApp,
    pathToLogs,
    maxSize: parsePositiveInt(env.LOG_MAX_SIZE, 5),
    maxFiles: parsePositiveInt(env.LOG_MAX_FILES, 5),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildLogger(env: LoggerEnv): Logger {
  const level = env.mode === "development" ? "debug" : "info";

  const line = format.combine(
    format.timestamp(),
    format.printf((info) => {
      const meta = { ...info } as Record<string, unknown>;
      delete meta.level;
      delete meta.message;
      delete meta.timestamp;
      const metaKeys = Object.keys(meta);
      const suffix = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : "";
      return `${String(info.timestamp)} [${env.nameApp}] ${info.level}: ${String(info.message)}${suffix}`;
    }),
  );

  const activeTransports = [];

  // development + testing log to console; testing + production log to files.
  if (env.mode === "development" || env.mode === "testing") {
    activeTransports.push(new transports.Console());
  }
  if (env.mode === "testing" || env.mode === "production") {
    activeTransports.push(
      new DailyRotateFile({
        filename: `${env.nameApp}-%DATE%.log`,
        dirname: env.pathToLogs,
        datePattern: "YYYY-MM-DD",
        maxSize: `${env.maxSize}m`,
        maxFiles: env.maxFiles,
        zippedArchive: false,
      }),
    );
  }

  return createLogger({ level, format: line, transports: activeTransports });
}

function initLogger(): Logger {
  let env: LoggerEnv;
  try {
    env = validateLoggerEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // No logger yet: write straight to stderr and exit non-zero immediately.
    process.stderr.write(`[worker-node] FATAL: ${message}\n`);
    process.exit(1);
  }

  return buildLogger(env);
}

const logger = initLogger();

type LogMeta = Record<string, unknown>;

export function logDebug(message: string, meta?: LogMeta) {
  logger.debug(message, meta);
}

export function logInfo(message: string, meta?: LogMeta) {
  logger.info(message, meta);
}

export function logWarn(message: string, meta?: LogMeta) {
  logger.warn(message, meta);
}

export function logError(message: string, meta?: LogMeta) {
  logger.error(message, meta);
}
