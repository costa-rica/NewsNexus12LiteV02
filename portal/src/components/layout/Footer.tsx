const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

export function Footer() {
  return (
    <footer
      data-testid="app-footer"
      className="stage-aligned-region mt-auto border-t border-gray-200/70 py-3 text-right text-xs text-gray-500 dark:border-white/10 dark:text-gray-400"
    >
      version {appVersion}
    </footer>
  );
}
