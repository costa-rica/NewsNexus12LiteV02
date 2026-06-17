import fs from "node:fs";
import path from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const DEFAULT_LOG_APP_NAME = "news-nexus-lite-portal";
const DEFAULT_LOG_MAX_SIZE_MB = 5;
const DEFAULT_LOG_MAX_FILES = 5;

let fileLoggingDisabled = false;
let fileLoggingProblemReported = false;

function getLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();

  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "silent"
  ) {
    return value;
  }

  return "info";
}

function shouldLog(level: LogLevel) {
  return LEVELS[level] >= LEVELS[getLogLevel()];
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getLocalDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLogAppName() {
  return (process.env.NAME_APP?.trim() || DEFAULT_LOG_APP_NAME).replace(
    /[^a-zA-Z0-9_.-]/g,
    "_",
  );
}

function getFileLoggingConfig() {
  const pathToLogs = process.env.PATH_TO_LOGS?.trim();

  if (!pathToLogs) {
    return null;
  }

  if (!path.isAbsolute(pathToLogs)) {
    reportFileLoggingProblem("PATH_TO_LOGS must be an absolute path", {
      pathToLogs,
    });
    return null;
  }

  return {
    appName: getLogAppName(),
    pathToLogs,
    maxSizeBytes:
      parsePositiveInt(process.env.LOG_MAX_SIZE, DEFAULT_LOG_MAX_SIZE_MB) *
      1024 *
      1024,
    maxFiles: parsePositiveInt(
      process.env.LOG_MAX_FILES,
      DEFAULT_LOG_MAX_FILES,
    ),
  };
}

function getActiveLogPath(pathToLogs: string, appName: string) {
  return path.join(pathToLogs, `${appName}-${getLocalDateStamp()}.log`);
}

function rotateLogFileIfNeeded(
  filePath: string,
  nextLineBytes: number,
  maxSizeBytes: number,
  maxFiles: number,
) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const currentSize = fs.statSync(filePath).size;
  if (currentSize + nextLineBytes <= maxSizeBytes) {
    return;
  }

  if (maxFiles <= 1) {
    fs.rmSync(filePath, { force: true });
    return;
  }

  const highestRotation = maxFiles - 1;
  fs.rmSync(`${filePath}.${highestRotation}`, { force: true });

  for (let index = highestRotation - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;

    if (fs.existsSync(source)) {
      fs.renameSync(source, target);
    }
  }

  fs.renameSync(filePath, `${filePath}.1`);
}

function cleanupOldLogFiles(
  pathToLogs: string,
  appName: string,
  maxFiles: number,
) {
  const managedLogPattern = new RegExp(
    `^${escapeRegExp(appName)}-\\d{4}-\\d{2}-\\d{2}\\.log(?:\\.\\d+)?$`,
  );

  const logFiles = fs
    .readdirSync(pathToLogs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && managedLogPattern.test(entry.name))
    .map((entry) => {
      const filePath = path.join(pathToLogs, entry.name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const oldFile of logFiles.slice(maxFiles)) {
    fs.rmSync(oldFile.filePath, { force: true });
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reportFileLoggingProblem(
  reason: string,
  meta?: Record<string, unknown>,
) {
  if (fileLoggingProblemReported) {
    return;
  }

  fileLoggingProblemReported = true;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  process.stderr.write(`[portal] warn: file logging disabled: ${reason}${suffix}\n`);
}

function writeLogFile(line: string) {
  if (fileLoggingDisabled) {
    return;
  }

  const config = getFileLoggingConfig();
  if (!config) {
    return;
  }

  try {
    fs.mkdirSync(config.pathToLogs, { recursive: true });

    const filePath = getActiveLogPath(config.pathToLogs, config.appName);
    rotateLogFileIfNeeded(
      filePath,
      Buffer.byteLength(line),
      config.maxSizeBytes,
      config.maxFiles,
    );
    fs.appendFileSync(filePath, line, "utf8");
    cleanupOldLogFiles(config.pathToLogs, config.appName, config.maxFiles);
  } catch (error) {
    fileLoggingDisabled = true;
    reportFileLoggingProblem(
      error instanceof Error ? error.message : "unknown file logging error",
    );
  }
}

// Portal (Next.js) logger per AGENTS.md: structured lines written directly to
// stdout/stderr (not the console API), so the no-console rule applies literally
// to all committed server code, including this logger. When PATH_TO_LOGS is set,
// the same structured lines are also mirrored to a portal-owned dated log file.
function writeLog(
  level: Exclude<LogLevel, "silent">,
  message: string,
  meta?: Record<string, unknown>,
) {
  if (!shouldLog(level)) {
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[portal] ${level}: ${message}${suffix}\n`;

  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    writeLogFile(line);
    return;
  }

  process.stdout.write(line);
  writeLogFile(line);
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
