import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import type {
  ManagedBrowserSessionInfo,
  ManagedBrowserState,
} from '../types/browserHealth.js';

const IDLE_TIMEOUT_MS = 1000 * 60 * 15; // 15 minutes max idle time

class PlaywrightSessionManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private state: ManagedBrowserState = 'Not connected';
  private sessionId: string | null = null;
  private browserVersion: string | null = null;
  private currentUrl: string | null = null;
  private pageTitle: string | null = null;
  private extractedHeading: string | null = null;
  private extractedSummary: string | null = null;
  private screenshotDataUrl: string | null = null;
  private screenshotCount = 0;
  private startedAt: string | null = null;
  private lastUpdatedAt: string = new Date().toLocaleTimeString();
  private lastScreenshotAt: string | null = null;
  private errorMessage: string | null = null;

  private isTransitioning = false;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor() {
    const cleanupOnExit = () => {
      void this.forceCleanup();
    };
    process.once('SIGINT', cleanupOnExit);
    process.once('SIGTERM', cleanupOnExit);
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      void this.closeSession();
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    let cleaned = raw;
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
      cleaned = cleaned.split(process.env.GEMINI_API_KEY).join('[REDACTED]');
    }
    return cleaned.slice(0, 600);
  }

  private isLive(): boolean {
    return Boolean(
      this.browser &&
        this.browser.isConnected() &&
        this.context &&
        this.page &&
        !this.page.isClosed()
    );
  }

  private async forceCleanup(): Promise<void> {
    this.clearIdleTimer();
    const pageToClose = this.page;
    const contextToClose = this.context;
    const browserToClose = this.browser;

    this.page = null;
    this.context = null;
    this.browser = null;

    try {
      if (pageToClose && !pageToClose.isClosed()) {
        await pageToClose.close();
      }
    } catch (_e) {
      // ignore cleanup error
    }
    try {
      if (contextToClose) {
        await contextToClose.close();
      }
    } catch (_e) {
      // ignore cleanup error
    }
    try {
      if (browserToClose && browserToClose.isConnected()) {
        await browserToClose.close();
      }
    } catch (_e) {
      // ignore cleanup error
    }
  }

  private resetMetadataToDisconnected(errorMsg: string | null = null) {
    this.state = errorMsg ? 'Error' : 'Not connected';
    this.sessionId = null;
    this.browserVersion = null;
    this.currentUrl = null;
    this.pageTitle = null;
    this.extractedHeading = null;
    this.extractedSummary = null;
    this.screenshotDataUrl = null;
    this.screenshotCount = 0;
    this.startedAt = null;
    this.lastUpdatedAt = new Date().toLocaleTimeString();
    this.lastScreenshotAt = null;
    this.errorMessage = errorMsg;
  }

  public buildSnapshot(): ManagedBrowserSessionInfo {
    const live = this.isLive();
    const effectiveState: ManagedBrowserState = this.isTransitioning
      ? this.state
      : live
      ? 'Connected'
      : this.errorMessage
      ? 'Error'
      : 'Not connected';

    return {
      state: effectiveState,
      connected: live && effectiveState === 'Connected',
      sessionId: live ? this.sessionId : null,
      browserVersion: live ? this.browserVersion : null,
      currentUrl: live ? this.currentUrl : null,
      pageTitle: live ? this.pageTitle : null,
      extractedHeading: live ? this.extractedHeading : null,
      extractedSummary: live ? this.extractedSummary : null,
      screenshotDataUrl: live ? this.screenshotDataUrl : null,
      screenshotCount: live ? this.screenshotCount : 0,
      startedAt: live ? this.startedAt : null,
      lastUpdatedAt: this.lastUpdatedAt,
      lastScreenshotAt: live ? this.lastScreenshotAt : null,
      errorMessage: this.errorMessage,
    };
  }

  public async getStatus(): Promise<ManagedBrowserSessionInfo> {
    if (!this.isTransitioning) {
      if (this.browser || this.page) {
        if (!this.isLive()) {
          await this.forceCleanup();
          this.resetMetadataToDisconnected(this.errorMessage);
        } else if (this.page) {
          try {
            this.pageTitle = await this.page.title();
            this.currentUrl = this.page.url();
            this.lastUpdatedAt = new Date().toLocaleTimeString();
          } catch (_err) {
            await this.forceCleanup();
            this.resetMetadataToDisconnected(
              'Browser page became unresponsive and was closed.'
            );
          }
        }
      }
    }
    return this.buildSnapshot();
  }

  public async startSession(
    fixedTargetUrl: string
  ): Promise<ManagedBrowserSessionInfo> {
    if (this.isTransitioning) {
      return this.buildSnapshot();
    }

    // If an active, healthy session already exists, refresh its screenshot and return it
    if (this.isLive() && this.page) {
      return this.captureScreenshot();
    }

    this.isTransitioning = true;
    this.state = 'Starting';
    this.errorMessage = null;
    this.lastUpdatedAt = new Date().toLocaleTimeString();

    try {
      await this.forceCleanup();

      const browser = await chromium.launch({
        headless: true,
        timeout: 15000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const context = await browser.newContext({
        viewport: { width: 880, height: 460 },
      });

      const page = await context.newPage();

      // Attach unexpected disconnect/close listeners
      browser.on('disconnected', () => {
        if (!this.isTransitioning && this.state === 'Connected') {
          this.resetMetadataToDisconnected(
            'Chromium browser process disconnected unexpectedly.'
          );
        }
      });

      await page.goto(fixedTargetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const nowStr = new Date().toLocaleTimeString();
      const sessionId = `sess-${crypto.randomBytes(4).toString('hex')}`;

      // Stamp session metadata into the live test page DOM before screenshot
      await page.evaluate(
        ({ sid, frameNum, capturedAt }) => {
          const timeEl = document.getElementById('verification-time');
          if (timeEl) {
            timeEl.textContent = `${capturedAt} (Frame #${frameNum})`;
          }
          const sessionEl = document.getElementById('verification-session');
          if (sessionEl) {
            sessionEl.textContent = sid;
          }
        },
        { sid: sessionId, frameNum: 1, capturedAt: nowStr }
      );

      const pageTitle = await page.title();
      const heading = await page.locator('#verification-heading').textContent();
      const summary = await page.locator('#verification-summary').textContent();
      const screenshotBuf = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      this.browser = browser;
      this.context = context;
      this.page = page;
      this.sessionId = sessionId;
      this.browserVersion = browser.version();
      this.currentUrl = page.url();
      this.pageTitle = pageTitle;
      this.extractedHeading = heading ? heading.trim() : null;
      this.extractedSummary = summary ? summary.trim() : null;
      this.screenshotDataUrl = `data:image/png;base64,${screenshotBuf.toString(
        'base64'
      )}`;
      this.screenshotCount = 1;
      this.startedAt = nowStr;
      this.lastUpdatedAt = nowStr;
      this.lastScreenshotAt = nowStr;
      this.state = 'Connected';
      this.errorMessage = null;

      this.resetIdleTimer();
    } catch (err: unknown) {
      await this.forceCleanup();
      this.resetMetadataToDisconnected(
        `Failed to start Chromium session: ${this.sanitizeError(err)}`
      );
    } finally {
      this.isTransitioning = false;
    }

    return this.buildSnapshot();
  }

  public async captureScreenshot(): Promise<ManagedBrowserSessionInfo> {
    if (this.isTransitioning) {
      return this.buildSnapshot();
    }

    if (!this.isLive() || !this.page) {
      await this.forceCleanup();
      this.resetMetadataToDisconnected(
        'Cannot capture screenshot: No active Chromium session is connected.'
      );
      return this.buildSnapshot();
    }

    this.isTransitioning = true;
    this.state = 'Capturing screenshot';
    this.errorMessage = null;

    try {
      const nowStr = new Date().toLocaleTimeString();
      const nextCount = this.screenshotCount + 1;
      const sid = this.sessionId || 'sess-active';

      // Update live timestamp & frame counter in the Playwright page so the refreshed screenshot reflects the new capture
      await this.page.evaluate(
        ({ sessionCode, frameNum, capturedAt }) => {
          const timeEl = document.getElementById('verification-time');
          if (timeEl) {
            timeEl.textContent = `${capturedAt} (Frame #${frameNum})`;
          }
          const sessionEl = document.getElementById('verification-session');
          if (sessionEl) {
            sessionEl.textContent = sessionCode;
          }
        },
        { sessionCode: sid, frameNum: nextCount, capturedAt: nowStr }
      );

      const pageTitle = await this.page.title();
      const screenshotBuf = await this.page.screenshot({
        type: 'png',
        fullPage: false,
      });

      this.pageTitle = pageTitle;
      this.currentUrl = this.page.url();
      this.screenshotDataUrl = `data:image/png;base64,${screenshotBuf.toString(
        'base64'
      )}`;
      this.screenshotCount = nextCount;
      this.lastScreenshotAt = nowStr;
      this.lastUpdatedAt = nowStr;
      this.state = 'Connected';
      this.errorMessage = null;

      this.resetIdleTimer();
    } catch (err: unknown) {
      await this.forceCleanup();
      this.resetMetadataToDisconnected(
        `Failed to capture screenshot from Chromium session: ${this.sanitizeError(
          err
        )}`
      );
    } finally {
      this.isTransitioning = false;
    }

    return this.buildSnapshot();
  }

  public async closeSession(): Promise<ManagedBrowserSessionInfo> {
    if (this.isTransitioning) {
      return this.buildSnapshot();
    }

    this.isTransitioning = true;
    this.state = 'Closing';

    try {
      await this.forceCleanup();
      this.resetMetadataToDisconnected(null);
    } catch (err: unknown) {
      this.resetMetadataToDisconnected(
        `Error while closing browser session: ${this.sanitizeError(err)}`
      );
    } finally {
      this.isTransitioning = false;
    }

    return this.buildSnapshot();
  }
}

export const browserSessionManager = new PlaywrightSessionManager();
