import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateLoggerEnv } from "./logger.js";

const validEnv = {
  NODE_ENV: "testing",
  NAME_APP: "TestApp",
  PATH_TO_LOGS: "/tmp/nnlite-logs",
} as NodeJS.ProcessEnv;

describe("validateLoggerEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const result = validateLoggerEnv(validEnv);
    expect(result).toMatchObject({
      mode: "testing",
      nameApp: "TestApp",
      pathToLogs: "/tmp/nnlite-logs",
      maxSize: 5,
      maxFiles: 5,
    });
  });

  it("rejects a missing NODE_ENV", () => {
    expect(() => validateLoggerEnv({ ...validEnv, NODE_ENV: undefined })).toThrow(
      /NODE_ENV/,
    );
  });

  it("rejects an invalid NODE_ENV (e.g. vitest's default 'test')", () => {
    expect(() => validateLoggerEnv({ ...validEnv, NODE_ENV: "test" })).toThrow(
      /Invalid NODE_ENV/,
    );
  });

  it("rejects a missing NAME_APP", () => {
    expect(() => validateLoggerEnv({ ...validEnv, NAME_APP: undefined })).toThrow(
      /NAME_APP/,
    );
  });

  it("rejects a relative PATH_TO_LOGS", () => {
    expect(() =>
      validateLoggerEnv({ ...validEnv, PATH_TO_LOGS: "./logs" }),
    ).toThrow(/absolute/);
  });
});

describe("logger module fatal exit", () => {
  it("exits non-zero when imported with an invalid NODE_ENV", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const tsxBin = path.join(here, "..", "node_modules", ".bin", "tsx");
    const loggerPath = path.join(here, "logger.ts");

    let exitCode = 0;
    let stderr = "";
    try {
      execFileSync(tsxBin, ["-e", `import(${JSON.stringify(loggerPath)})`], {
        env: { ...process.env, NODE_ENV: "bogus-mode" },
        stdio: "pipe",
      });
    } catch (error) {
      const err = error as { status?: number; stderr?: Buffer };
      exitCode = err.status ?? 0;
      stderr = err.stderr?.toString() ?? "";
    }

    expect(exitCode).toBe(1);
    expect(stderr).toContain("FATAL");
  });
});
