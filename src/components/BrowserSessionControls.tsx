import React from 'react';
import { Loader2, Play, RotateCw, X } from 'lucide-react';
import { ManagedBrowserSessionInfo } from '../types/browserHealth';

interface BrowserSessionControlsProps {
  session: ManagedBrowserSessionInfo;
  onStartBrowser: () => void;
  onRefreshScreenshot: () => void;
  onCloseBrowser: () => void;
}

export const BrowserSessionControls: React.FC<BrowserSessionControlsProps> = ({
  session,
  onStartBrowser,
  onRefreshScreenshot,
  onCloseBrowser,
}) => {
  const isStarting = session.state === 'Starting';
  const isRefreshing = session.state === 'Capturing screenshot';
  const isClosing = session.state === 'Closing';
  const isTransitioning = isStarting || isRefreshing || isClosing;

  // When disconnected (or starting), show only Start Browser
  if (!session.connected && !isRefreshing && !isClosing) {
    return (
      <button
        type="button"
        onClick={onStartBrowser}
        disabled={isTransitioning}
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-100 hover:bg-white disabled:opacity-50 disabled:pointer-events-none text-neutral-950 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
      >
        {isStarting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Starting Browser...</span>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            <span>Start Browser</span>
          </>
        )}
      </button>
    );
  }

  // When connected, show Refresh Screenshot and Close Browser
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefreshScreenshot}
        disabled={isTransitioning}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-45 disabled:pointer-events-none text-neutral-200 border border-white/[0.08] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
      >
        {isRefreshing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RotateCw className="w-3.5 h-3.5" />
        )}
        <span>Refresh Screenshot</span>
      </button>

      <button
        type="button"
        onClick={onCloseBrowser}
        disabled={isTransitioning}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-45 disabled:pointer-events-none text-rose-200 border border-rose-500/30 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
      >
        {isClosing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
        <span>Close Browser</span>
      </button>
    </div>
  );
};
