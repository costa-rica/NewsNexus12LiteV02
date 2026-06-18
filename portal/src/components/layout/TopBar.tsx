import Image from "next/image";

import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  return (
    <header
      data-testid="top-bar"
      className="stage-aligned-region flex items-center justify-between gap-4 py-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Image
          src="/images/logoWhiteBackground.png"
          alt="News Nexus Lite logo"
          width={40}
          height={40}
          priority
          className="h-10 w-10 rounded-lg border border-gray-200 bg-white object-contain shadow-theme-sm"
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">
            News Nexus Lite
          </p>
        </div>
      </div>
      <ThemeToggle />
    </header>
  );
}
