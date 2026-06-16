import os from "node:os";
import path from "node:path";

import { defineConfig } from "vitest/config";

// The logger validates its env at import time (docs/LOGGING_NODE_JS_V08.md), so
// tests must run under a valid logging mode with the required vars present.
// Vitest's default NODE_ENV is "test", which is NOT an allowed value.
const testLogDir = path.join(os.tmpdir(), "nnlite-worker-test-logs");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "testing",
      NAME_APP: "NewsNexusLiteWorkerTest",
      PATH_TO_LOGS: testLogDir,
    },
  },
});
