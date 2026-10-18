import React from 'react';
import { Globe, AlertCircle, X, Loader2 } from 'lucide-react';
import { ManagedBrowserSessionInfo } from '../types/browserHealth';
import { BrowserSessionControls } from './BrowserSessionControls';

interface BrowserPanelProps {
  session: ManagedBrowserSessionInfo;
  onStartBrowser: () => void;
  onRefreshScreenshot: () => void;
  onCloseBrowser: () => void;
  onCollapsePanel: () => void;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  session,
  onStartBrowser,
  onRefreshScreenshot,
  onCloseBrowser,
  onCollapsePanel,
}) => {
  const isConnected = session.connected;

  return (
    <aside
      aria-label="Browser Preview"
      className="h-full w-full bg-[#0C0E12] border-l border-white/[0.07] flex flex-col overflow-hidden select-none"
    >
      {/* Top Panel Bar */}
      <div className="h-12 px-4 border-b border-white/[0.07] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-neutral-200 truncate">
            Browser Preview
          </span>
          <span aria-hidden="true" className="text-white/20">
            ·
          </span>
          <span
            className={`font-mono text-[11px] truncate ${
              isConnected ? 'text-emerald-300' : 'text-neutral-400'
            }`}
            data-testid="browser-panel-status"
          >
            {isConnected ? 'Browser connected' : session.state}
          </span>
        </div>

        <button
          type="button"
          onClick={onCollapsePanel}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
          aria-label="Collapse Browser Preview panel"
          title="Close Browser Preview panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Error Message Banner if a browser request failed */}
      {session.errorMessage && (
        <div
          role="alert"
          className="mx-4 mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-200"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{session.errorMessage}</span>
        </div>
      )}

      {/* Body: Disconnected Empty State vs Connected Live Screenshot */}
      {!isConnected && session.state !== 'Capturing screenshot' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-xs space-y-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-400 mx-auto">
              <Globe className="w-4 h-4" />
            </div>

            <div className="space-y-1">
              <h2 className="font-display font-semibold text-sm text-white">
                Browser not connected
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Start a browser session to view the agent&apos;s browser.
              </p>
            </div>

            <div className="pt-1">
              <BrowserSessionControls
                session={session}
                onStartBrowser={onStartBrowser}
                onRefreshScreenshot={onRefreshScreenshot}
                onCloseBrowser={onCloseBrowser}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Verified Page Metadata & Session Controls */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div
                  className="text-xs font-medium text-white truncate"
                  title={session.pageTitle || ''}
                >
                  {session.pageTitle || 'Untitled Page'}
                </div>
                {session.currentUrl && (
                  <div
                    className="font-mono text-[11px] text-neutral-400 truncate mt-0.5"
                    title={session.currentUrl}
                  >
                    {session.currentUrl}
                  </div>
                )}
              </div>

              <BrowserSessionControls
                session={session}
                onStartBrowser={onStartBrowser}
                onRefreshScreenshot={onRefreshScreenshot}
                onCloseBrowser={onCloseBrowser}
              />
            </div>
          </div>

          {/* Actual Playwright PNG Screenshot */}
          <div className="rounded-lg overflow-hidden border border-white/[0.1] bg-[#08090C]">
            {session.screenshotDataUrl ? (
              <img
                src={session.screenshotDataUrl}
                alt={
                  session.pageTitle
                    ? `Browser screenshot of ${session.pageTitle}`
                    : 'Playwright browser screenshot'
                }
                referrerPolicy="no-referrer"
                className="w-full h-auto block"
                data-testid="real-browser-screenshot"
              />
            ) : (
              <div className="h-52 flex items-center justify-center gap-2 text-xs text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Capturing screenshot...</span>
              </div>
            )}
          </div>

          {/* Quiet Session Footer */}
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
            <span>Server-side Chromium {session.browserVersion || ''}</span>
            {session.lastScreenshotAt && (
              <span className="tabular-nums">
                Captured {session.lastScreenshotAt}
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
