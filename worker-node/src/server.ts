import "dotenv/config";

// Import the logger first: it validates the logging env at import time and
// fatally exits (stderr + non-zero) before any app code runs if it is invalid.
import { logError, logInfo } from "./logger.js";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "8081", 10);
const app = createApp();
const server = app.listen(port);

server.on("listening", () => {
  logInfo("listening", { port });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  logError("server failed to listen", {
    port,
    code: error.code,
    reason: error.message,
  });
  process.exitCode = 1;
});
