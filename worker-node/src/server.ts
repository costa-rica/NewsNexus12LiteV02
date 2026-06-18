import "dotenv/config";

// Import the logger first: it validates the logging env at import time and
// fatally exits (stderr + non-zero) before any app code runs if it is invalid.
import { logError, logInfo } from "./logger.js";
import { createApp } from "./app.js";
import { loadLocationScorerConfig } from "./modules/location-scorer/config.js";
import { createThreadLocationClassifier } from "./modules/location-scorer/threadClassifier.js";

const port = Number.parseInt(process.env.PORT ?? "8081", 10);
const locationClassifier = createThreadLocationClassifier(loadLocationScorerConfig());
const app = createApp({ locationClassifier });
const server = app.listen(port);

server.on("listening", () => {
  logInfo("listening", { port });
  logInfo("location classifier warm-up started");
  void locationClassifier
    .load()
    .then(() => {
      logInfo("location classifier warm-up completed");
    })
    .catch((error: unknown) => {
      logError("location classifier warm-up failed", {
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  logError("server failed to listen", {
    port,
    code: error.code,
    reason: error.message,
  });
  process.exitCode = 1;
});
