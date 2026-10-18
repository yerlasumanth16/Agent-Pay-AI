export type BlockerCategory =
  | 'NONE'
  | 'MISSING_BROWSER_BINARY'
  | 'MISSING_OS_DEPENDENCIES'
  | 'UNSUPPORTED_EXECUTION_PERMISSIONS'
  | 'RUNTIME_LIMITATION'
  | 'UNKNOWN_ERROR';

export interface BrowserHealthCheckResult {
  success: boolean;
  timestamp: string;
  durationMs: number;
  playwrightInstalled: boolean;
  chromiumLaunched: boolean;
  browserVersion: string | null;
  executablePathChecked: string | null;
  navigatedUrl: string | null;
  pageTitle: string | null;
  extractedHeading: string | null;
  extractedContent: string | null;
  screenshotDataUrl: string | null;
  browserClosedCleanly: boolean;
  runtimeEnvironment: {
    platform: string;
    arch: string;
    kernelRelease: string;
    nodeVersion: string;
    isContainerOrGvisor: boolean;
  };
  diagnostic: {
    blockerCategory: BlockerCategory;
    summary: string;
    rawErrorName: string | null;
    rawErrorMessage: string | null;
    missingLibraries: string[];
    architecturalRecommendation: string;
  };
}

export type ManagedBrowserState =
  | 'Not connected'
  | 'Starting'
  | 'Connected'
  | 'Capturing screenshot'
  | 'Closing'
  | 'Error';

export interface ManagedBrowserSessionInfo {
  state: ManagedBrowserState;
  connected: boolean;
  sessionId: string | null;
  browserVersion: string | null;
  currentUrl: string | null;
  pageTitle: string | null;
  extractedHeading: string | null;
  extractedSummary: string | null;
  screenshotDataUrl: string | null;
  screenshotCount: number;
  startedAt: string | null;
  lastUpdatedAt: string;
  lastScreenshotAt: string | null;
  errorMessage: string | null;
}
