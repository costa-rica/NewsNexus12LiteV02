import "dotenv/config";

import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "8081", 10);
const app = createApp();

app.listen(port, () => {
  console.log(`worker-node listening on port ${port}`);
});
