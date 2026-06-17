import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { logDebug, logInfo } from "./serverLogger";

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

function makeTempLogDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nnlite-portal-logs-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("serverLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };

    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("mirrors structured logs to a dated file when PATH_TO_LOGS is set", () => {
    const tempDir = makeTempLogDir();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    process.env.LOG_LEVEL = "info";
    process.env.NAME_APP = "Portal Test";
    process.env.PATH_TO_LOGS = tempDir;
    process.env.LOG_MAX_SIZE = "5";
    process.env.LOG_MAX_FILES = "5";

    logInfo("file mirror test", {
      route: "google-rss.make-request",
      count: 1,
    });

    const fileName = `Portal_Test-${localDateStamp()}.log`;
    const filePath = path.join(tempDir, fileName);

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe(
      '[portal] info: file mirror test {"route":"google-rss.make-request","count":1}\n',
    );
  });

  it("does not create a file for messages below LOG_LEVEL", () => {
    const tempDir = makeTempLogDir();

    process.env.LOG_LEVEL = "info";
    process.env.PATH_TO_LOGS = tempDir;

    logDebug("hidden debug log");

    expect(fs.readdirSync(tempDir)).toEqual([]);
  });
});
