import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { type ArticleContentConfig, loadArticleContentConfig } from "./config.js";

export interface BrowserPage {
  goto(
    url: string,
    options: { waitUntil: "domcontentloaded"; timeout: number },
  ): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
}

export interface BrowserPageProvider {
  getPage(): Promise<BrowserPage>;
  recordNavigationError(): Promise<void>;
}

type BrowserLauncher = () => Promise<Browser>;

export class NavigationSessionManager implements BrowserPageProvider {
  private browser?: Browser;
  private context?: BrowserContext;
  private attemptCount = 0;
  private navigationErrorCount = 0;

  constructor(
    private readonly config: ArticleContentConfig = loadArticleContentConfig(),
    private readonly launchBrowser: BrowserLauncher = () => chromium.launch({ headless: true }),
  ) {}

  async getPage(): Promise<Page> {
    if (!this.context || this.attemptCount >= this.config.browserRecycleAttempts) {
      await this.recycle();
      await this.openContext();
    }

    this.attemptCount += 1;

    return this.context!.newPage();
  }

  async recordNavigationError() {
    this.navigationErrorCount += 1;

    if (this.navigationErrorCount >= this.config.browserRecycleNavigationErrors) {
      await this.recycle();
    }
  }

  async dispose() {
    await this.recycle();
  }

  private async openContext() {
    this.browser = await this.launchBrowser();
    this.context = await this.browser.newContext({
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      viewport: {
        width: 1440,
        height: 900,
      },
      extraHTTPHeaders: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    this.attemptCount = 0;
    this.navigationErrorCount = 0;
  }

  private async recycle() {
    const context = this.context;
    const browser = this.browser;
    this.context = undefined;
    this.browser = undefined;
    this.attemptCount = 0;
    this.navigationErrorCount = 0;

    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
