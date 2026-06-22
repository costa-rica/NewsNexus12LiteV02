import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
  },
  reactStrictMode: true,
};

export default nextConfig;

function readAppVersion() {
  try {
    const configDir = dirname(fileURLToPath(import.meta.url));
    const scriptPath = resolve(configDir, "../scripts/appVersion.mjs");
    const version = execFileSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return version || "dev";
  } catch {
    return "dev";
  }
}
