import "dotenv/config";

// Import the logger first: it validates the logging env at import time and
// fatally exits (stderr + non-zero) before any app code runs if it is invalid.
import { logInfo } from "./logger.js";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "8081", 10);
const app = createApp();

app.listen(port, () => {
  logInfo("listening", { port });
});
