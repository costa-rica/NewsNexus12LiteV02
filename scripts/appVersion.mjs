import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function getAppVersion() {
  try {
    const mergeBase = git(["merge-base", "HEAD", "main"]);
    const mainCount = git(["rev-list", "--count", mergeBase]);
    const branchCount = git(["rev-list", "--count", `${mergeBase}..HEAD`]);

    return `${mainCount}.${branchCount}`;
  } catch {
    return "dev";
  }
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${getAppVersion()}\n`);
}
