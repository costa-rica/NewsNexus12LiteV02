type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function getLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();

  if (value === "debug" || value === "info" || value === "warn" || value === "error" || value === "silent") {
    return value;
  }

  return "info";
}

function shouldLog(level: LogLevel) {
  return LEVELS[level] >= LEVELS[getLogLevel()];
}

// Portal (Next.js) logger per AGENTS.md: structured lines written directly to
// stdout/stderr (not the console API), so the no-console rule applies literally
// to all committed server code, including this logger.
function writeLog(level: Exclude<LogLevel, "silent">, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) {
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[portal] ${level}: ${message}${suffix}\n`;

  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export function logDebug(message: string, meta?: Record<string, unknown>) {
  writeLog("debug", message, meta);
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  writeLog("info", message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  writeLog("warn", message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>) {
  writeLog("error", message, meta);
}
