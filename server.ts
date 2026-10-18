import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { BlockerCategory, BrowserHealthCheckResult } from './src/types/browserHealth.js';
import { browserSessionManager } from './src/server/browserSessionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

// Ephemeral in-memory access tokens for browser endpoint protection
const validTokens = new Map<string, number>();
const TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutes

// Concurrency & rate-limiting state for one-shot health check and session operations
let isHealthCheckRunning = false;
const recentCheckTimestamps: number[] = [];
const MAX_CHECKS_PER_MINUTE = 30;

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, expiresAt] of validTokens.entries()) {
    if (now > expiresAt) {
      validTokens.delete(token);
    }
  }
}

function checkRateLimit(res: Response): boolean {
  const now = Date.now();
  while (recentCheckTimestamps.length > 0 && now - recentCheckTimestamps[0] > 60_000) {
    recentCheckTimestamps.shift();
  }
  if (recentCheckTimestamps.length >= MAX_CHECKS_PER_MINUTE) {
    res.status(429).json({
      error: 'Rate limit exceeded: Too many browser operations per minute.',
    });
    return false;
  }
  recentCheckTimestamps.push(now);
  return true;
}

function sanitizeErrorMessage(raw: string): string {
  let cleaned = raw;
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    cleaned = cleaned.split(process.env.GEMINI_API_KEY).join('[REDACTED]');
  }
  return cleaned.slice(0, 2000);
}

function classifyPlaywrightError(
  errorMsg: string,
  executableExists: boolean
): {
  category: BlockerCategory;
  summary: string;
  missingLibraries: string[];
  recommendation: string;
} {
  const missingLibs: string[] = [];
  const soMatches = errorMsg.match(/([a-zA-Z0-9._+-]+\.so(?:\.[0-9]+)*)/g);
  if (soMatches) {
    for (const lib of soMatches) {
      if (!missingLibs.includes(lib)) {
        missingLibs.push(lib);
      }
    }
  }

  if (
    !executableExists ||
    errorMsg.includes("Executable doesn't exist") ||
    errorMsg.includes('playwright install')
  ) {
    return {
      category: 'MISSING_BROWSER_BINARY',
      summary:
        'Playwright npm package is installed, but the Chromium browser binary is missing from the local cache.',
      missingLibraries: missingLibs,
      recommendation:
        'Run `npx playwright install chromium` during the build/provisioning step or connect to a dedicated Playwright browser worker.',
    };
  }

  if (
    errorMsg.includes('error while loading shared libraries') ||
    errorMsg.includes('Host system is missing dependencies') ||
    missingLibs.length > 0
  ) {
    return {
      category: 'MISSING_OS_DEPENDENCIES',
      summary: `Chromium binary is present, but required Linux shared libraries (${
        missingLibs.join(', ') || 'system graphics/NSS packages'
      }) are missing from the container image.`,
      missingLibraries: missingLibs,
      recommendation:
        'Install required Debian/Ubuntu shared libraries (`npx playwright install-deps chromium` or apt packages such as libnss3, libatk1.0-0, libgbm1, libasound2) or use a Playwright-enabled container worker.',
    };
  }

  if (
    errorMsg.includes('Operation not permitted') ||
    errorMsg.includes('Permission denied') ||
    errorMsg.includes('EACCES') ||
    errorMsg.includes('sandbox')
  ) {
    return {
      category: 'UNSUPPORTED_EXECUTION_PERMISSIONS',
      summary:
        'Chromium launch was blocked by container execution permissions or Linux user-namespace sandbox restrictions.',
      missingLibraries: missingLibs,
      recommendation:
        'Launch Chromium with container-safe flags (`--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`) or delegate browser sessions to an isolated browser worker container.',
    };
  }

  if (
    errorMsg.includes('gvisor') ||
    errorMsg.includes('Target page, context or browser has been closed') ||
    errorMsg.includes('SIGTRAP') ||
    errorMsg.includes('SIGSEGV') ||
    errorMsg.includes('pthread') ||
    errorMsg.includes('clone')
  ) {
    return {
      category: 'RUNTIME_LIMITATION',
      summary:
        'The sandboxed container kernel (gVisor) restricted Chromium multi-process/shared-memory syscalls during startup.',
      missingLibraries: missingLibs,
      recommendation:
        'Connect AgentPay AI to a dedicated Playwright-enabled container or remote CDP browser worker service (`chromium.connectOverCDP`) for production reliability.',
    };
  }

  return {
    category: 'UNKNOWN_ERROR',
    summary: 'Chromium encountered an unexpected runtime error during launch or navigation.',
    missingLibraries: missingLibs,
    recommendation:
      'Inspect the raw error details below and verify container OS libraries and memory limits.',
  };
}

function requireWorkspaceAuth(req: Request, res: Response, next: NextFunction) {
  cleanupExpiredTokens();
  const clientHeader = req.headers['x-agentpay-client'];
  const authHeader = req.headers.authorization;

  if (clientHeader !== 'workspace-v2' || !authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid workspace access token.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const expiry = validTokens.get(token);
  if (!expiry || Date.now() > expiry) {
    validTokens.delete(token);
    res.status(403).json({
      error: 'Forbidden: Workspace session token expired or invalid.',
    });
    return;
  }

  next();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  const fixedLocalTargetUrl = `http://127.0.0.1:${PORT}/api/browser/local-test-page`;

  // 1. Issue short-lived workspace token to same-origin AgentPay UI
  app.post('/api/browser/session-token', (req: Request, res: Response) => {
    const clientHeader = req.headers['x-agentpay-client'];
    if (clientHeader !== 'workspace-v2') {
      res.status(403).json({ error: 'Forbidden client header' });
      return;
    }
    cleanupExpiredTokens();
    const token = crypto.randomBytes(24).toString('hex');
    validTokens.set(token, Date.now() + TOKEN_TTL_MS);
    res.json({ token, expiresInMs: TOKEN_TTL_MS });
  });

  // 2. Harmless, fixed, local test page served directly by this application
  app.get('/api/browser/local-test-page', (_req: Request, res: Response) => {
    const serverTime = new Date().toLocaleTimeString();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>AgentPay AI — Local Playwright Verification Target</title>
    <style>
      body {
        margin: 0;
        padding: 28px;
        background: #0B0D11;
        color: #E6E8EE;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .card {
        max-width: 800px;
        margin: 0 auto;
        background: #121722;
        border: 1px solid #2A3246;
        border-radius: 12px;
        padding: 26px;
      }
      .top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .badge {
        display: inline-block;
        font-family: monospace;
        font-size: 12px;
        color: #34D399;
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.35);
        padding: 4px 10px;
        border-radius: 6px;
      }
      .session-pill {
        font-family: monospace;
        font-size: 12px;
        color: #A5B4FC;
      }
      h1 {
        margin: 0 0 10px 0;
        font-size: 22px;
        color: #FFFFFF;
      }
      p {
        margin: 0 0 18px 0;
        font-size: 14px;
        line-height: 1.6;
        color: #94A3B8;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        border-top: 1px solid #1E2638;
        padding-top: 16px;
        font-family: monospace;
        font-size: 12px;
      }
      .cell-label {
        color: #64748B;
        margin-bottom: 4px;
      }
      .cell-val {
        color: #E2E8F0;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="top-row">
        <div class="badge">LIVE MANAGED CHROMIUM SESSION</div>
        <div class="session-pill">SESSION: <span id="verification-session">ephemeral-check</span></div>
      </div>
      <h1 id="verification-heading">AgentPay AI Phase 2 Browser Automation Target</h1>
      <p id="verification-summary">
        This controlled local verification page is rendered inside a real headless Chromium browser instance controlled by Playwright on the AgentPay AI server.
      </p>
      <div class="grid">
        <div>
          <div class="cell-label">BROWSER ENGINE</div>
          <div class="cell-val" id="verification-engine">Headless Chromium (Playwright)</div>
        </div>
        <div>
          <div class="cell-label">NAVIGATION MODE</div>
          <div class="cell-val">Fixed Local Loopback</div>
        </div>
        <div>
          <div class="cell-label">CAPTURE TIMESTAMP</div>
          <div class="cell-val" id="verification-time">${serverTime}</div>
        </div>
      </div>
    </div>
  </body>
</html>`);
  });

  // 3. Managed Playwright Browser Session Endpoints (Phase 2, Step 2)
  app.get(
    '/api/browser/session/status',
    requireWorkspaceAuth,
    async (_req: Request, res: Response) => {
      const status = await browserSessionManager.getStatus();
      res.json(status);
    }
  );

  app.post(
    '/api/browser/session/start',
    requireWorkspaceAuth,
    async (_req: Request, res: Response) => {
      if (!checkRateLimit(res)) return;
      // Never accept arbitrary URLs from request body; always use fixedLocalTargetUrl
      const status = await browserSessionManager.startSession(fixedLocalTargetUrl);
      res.json(status);
    }
  );

  app.post(
    '/api/browser/session/screenshot',
    requireWorkspaceAuth,
    async (_req: Request, res: Response) => {
      if (!checkRateLimit(res)) return;
      const status = await browserSessionManager.captureScreenshot();
      res.json(status);
    }
  );

  app.post(
    '/api/browser/session/close',
    requireWorkspaceAuth,
    async (_req: Request, res: Response) => {
      if (!checkRateLimit(res)) return;
      const status = await browserSessionManager.closeSession();
      res.json(status);
    }
  );

  // 4. Existing One-Shot Compatibility Health-Check Operation (Preserved from Phase 2, Step 1)
  app.post(
    '/api/browser/health-check',
    requireWorkspaceAuth,
    async (_req: Request, res: Response) => {
      if (!checkRateLimit(res)) return;

      if (isHealthCheckRunning) {
        res.status(409).json({
          error: 'A browser health check is already in progress. Please wait for it to complete.',
        });
        return;
      }

      isHealthCheckRunning = true;

      const startTime = Date.now();
      const kernelRelease = os.release();
      const runtimeEnvironment = {
        platform: os.platform(),
        arch: os.arch(),
        kernelRelease,
        nodeVersion: process.version,
        isContainerOrGvisor:
          kernelRelease.toLowerCase().includes('gvisor') || fs.existsSync('/.dockerenv'),
      };

      let executablePathChecked: string | null = null;
      let executableExists = false;
      let browser: Browser | null = null;
      let context: BrowserContext | null = null;
      let page: Page | null = null;
      let browserClosedCleanly = false;

      try {
        executablePathChecked = chromium.executablePath();
        executableExists = Boolean(
          executablePathChecked && fs.existsSync(executablePathChecked)
        );
      } catch (_e) {
        executablePathChecked = null;
        executableExists = false;
      }

      try {
        browser = await chromium.launch({
          headless: true,
          timeout: 15000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });

        const browserVersion = browser.version();
        context = await browser.newContext({
          viewport: { width: 880, height: 420 },
        });
        page = await context.newPage();

        await page.goto(fixedLocalTargetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });

        const pageTitle = await page.title();
        const extractedHeading = await page
          .locator('#verification-heading')
          .textContent();
        const extractedContent = await page
          .locator('#verification-summary')
          .textContent();

        const screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: false,
        });
        const screenshotDataUrl = `data:image/png;base64,${screenshotBuffer.toString(
          'base64'
        )}`;

        await page.close();
        page = null;
        await context.close();
        context = null;
        await browser.close();
        browser = null;
        browserClosedCleanly = true;

        const result: BrowserHealthCheckResult = {
          success: true,
          timestamp: new Date().toLocaleTimeString(),
          durationMs: Date.now() - startTime,
          playwrightInstalled: true,
          chromiumLaunched: true,
          browserVersion,
          executablePathChecked,
          navigatedUrl: fixedLocalTargetUrl,
          pageTitle,
          extractedHeading: extractedHeading ? extractedHeading.trim() : null,
          extractedContent: extractedContent ? extractedContent.trim() : null,
          screenshotDataUrl,
          browserClosedCleanly,
          runtimeEnvironment,
          diagnostic: {
            blockerCategory: 'NONE',
            summary:
              'Headless Chromium launched, navigated to the fixed local test page, extracted DOM content, captured a PNG screenshot, and closed cleanly.',
            rawErrorName: null,
            rawErrorMessage: null,
            missingLibraries: [],
            architecturalRecommendation:
              'Real headless Chromium execution works natively in this runtime. We can proceed with Phase 2 Playwright browser automation.',
          },
        };

        res.json(result);
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        const rawMessage = sanitizeErrorMessage(errorObj.message || String(err));
        const classification = classifyPlaywrightError(rawMessage, executableExists);

        const result: BrowserHealthCheckResult = {
          success: false,
          timestamp: new Date().toLocaleTimeString(),
          durationMs: Date.now() - startTime,
          playwrightInstalled: true,
          chromiumLaunched: false,
          browserVersion: null,
          executablePathChecked,
          navigatedUrl: fixedLocalTargetUrl,
          pageTitle: null,
          extractedHeading: null,
          extractedContent: null,
          screenshotDataUrl: null,
          browserClosedCleanly: true,
          runtimeEnvironment,
          diagnostic: {
            blockerCategory: classification.category,
            summary: classification.summary,
            rawErrorName: errorObj.name || 'Error',
            rawErrorMessage: rawMessage,
            missingLibraries: classification.missingLibraries,
            architecturalRecommendation: classification.recommendation,
          },
        };

        res.json(result);
      } finally {
        try {
          if (page) await page.close();
        } catch (_e) {
          // ignore
        }
        try {
          if (context) await context.close();
        } catch (_e) {
          // ignore
        }
        try {
          if (browser) {
            await browser.close();
            browserClosedCleanly = true;
          }
        } catch (_e) {
          // ignore
        }
        isHealthCheckRunning = false;
      }
    }
  );

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentPay AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
