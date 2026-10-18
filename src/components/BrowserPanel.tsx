import React, { useState } from 'react';
import { Globe, AlertCircle, X, Loader2, ShieldAlert } from 'lucide-react';
import { ManagedBrowserSessionInfo } from '../types/browserHealth';
import {
  AllowedKey,
  BrowserActionRequest,
  BrowserActionResponse,
  BrowserActionType,
  LocatorStrategy,
  PageInspectionResult,
  ScrollDirection,
  SupportedAriaRole,
} from '../types/browserActions';
import { BrowserSessionControls } from './BrowserSessionControls';

interface BrowserPanelProps {
  session: ManagedBrowserSessionInfo;
  isExecutingAction: boolean;
  lastActionResponse: BrowserActionResponse | null;
  onStartBrowser: () => void;
  onRefreshScreenshot: () => void;
  onCloseBrowser: () => void;
  onExecuteAction: (request: BrowserActionRequest) => Promise<void>;
  onCollapsePanel: () => void;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  session,
  isExecutingAction,
  lastActionResponse,
  onStartBrowser,
  onRefreshScreenshot,
  onCloseBrowser,
  onExecuteAction,
  onCollapsePanel,
}) => {
  const isConnected = session.connected;

  // Minimal Browser Action controls state (only used when session is active)
  const [selectedAction, setSelectedAction] =
    useState<BrowserActionType>('inspectPage');
  const [navUrl, setNavUrl] = useState('');
  const [locatorStrategy, setLocatorStrategy] =
    useState<LocatorStrategy>('role');
  const [ariaRole, setAriaRole] = useState<SupportedAriaRole>('button');
  const [targetValue, setTargetValue] = useState('');
  const [fillValue, setFillValue] = useState('');
  const [scrollDirection, setScrollDirection] =
    useState<ScrollDirection>('down');
  const [keyToPress, setKeyToPress] = useState<AllowedKey>('Enter');

  const handleRunAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || isExecutingAction) return;

    switch (selectedAction) {
      case 'inspectPage':
        await onExecuteAction({ action: 'inspectPage' });
        break;
      case 'captureScreenshot':
        await onExecuteAction({ action: 'captureScreenshot' });
        break;
      case 'navigate':
        await onExecuteAction({ action: 'navigate', url: navUrl });
        break;
      case 'click':
        await onExecuteAction({
          action: 'click',
          target: {
            strategy: locatorStrategy,
            role: locatorStrategy === 'role' ? ariaRole : undefined,
            value: targetValue,
          },
        });
        break;
      case 'fill':
        await onExecuteAction({
          action: 'fill',
          target: {
            strategy: locatorStrategy,
            role: locatorStrategy === 'role' ? ariaRole : undefined,
            value: targetValue,
          },
          value: fillValue,
        });
        break;
      case 'scroll':
        await onExecuteAction({
          action: 'scroll',
          direction: scrollDirection,
          amount: 360,
        });
        break;
      case 'pressKey':
        await onExecuteAction({
          action: 'pressKey',
          key: keyToPress,
          target: targetValue.trim()
            ? {
                strategy: locatorStrategy,
                role: locatorStrategy === 'role' ? ariaRole : undefined,
                value: targetValue,
              }
            : undefined,
        });
        break;
    }
  };

  const handleApproveExternalOrigin = async () => {
    if (!lastActionResponse?.pendingOrigin || isExecutingAction) return;
    await onExecuteAction({
      action: 'navigate',
      url: navUrl || lastActionResponse.pendingOrigin,
      approveOrigin: true,
    });
  };

  const inspectionResult =
    lastActionResponse?.success &&
    lastActionResponse.action === 'inspectPage' &&
    lastActionResponse.result
      ? (lastActionResponse.result as PageInspectionResult)
      : null;

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

      {/* Session Error Message Banner */}
      {session.errorMessage && (
        <div
          role="alert"
          className="mx-4 mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-200"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{session.errorMessage}</span>
        </div>
      )}

      {/* Body: Disconnected Empty State vs Connected Live Session */}
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
                Start a browser session to view and interact with the server-side Chromium browser.
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
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
            <span>Screenshot from real browser session</span>
            {session.lastScreenshotAt && (
              <span className="tabular-nums">
                Captured {session.lastScreenshotAt}
              </span>
            )}
          </div>

          {/* Minimal Browser Action Surface (Active Session Only) */}
          <div className="pt-3 border-t border-white/[0.07] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">
                Browser Action
              </span>
              {isExecutingAction && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-neutral-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Executing...</span>
                </span>
              )}
            </div>

            <form onSubmit={handleRunAction} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Browser action type"
                  value={selectedAction}
                  onChange={(e) => {
                    const next = e.target.value as BrowserActionType;
                    setSelectedAction(next);
                    if (next === 'fill' && locatorStrategy === 'role') {
                      setAriaRole('textbox');
                    } else if (next === 'click' && locatorStrategy === 'role') {
                      setAriaRole('button');
                    }
                  }}
                  disabled={isExecutingAction}
                  className="flex-1 bg-[#11141B] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-white/[0.25]"
                >
                  <option value="inspectPage">Inspect Page</option>
                  <option value="navigate">Navigate</option>
                  <option value="click">Click Element</option>
                  <option value="fill">Fill Input</option>
                  <option value="scroll">Scroll Page</option>
                  <option value="pressKey">Press Key</option>
                  <option value="captureScreenshot">Capture Screenshot</option>
                </select>

                <button
                  type="submit"
                  disabled={isExecutingAction}
                  className="px-3 py-1.5 rounded-md bg-neutral-100 hover:bg-white disabled:opacity-45 text-neutral-950 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Run Action
                </button>
              </div>

              {selectedAction === 'navigate' && (
                <input
                  type="text"
                  value={navUrl}
                  onChange={(e) => setNavUrl(e.target.value)}
                  placeholder="https://example.com"
                  aria-label="Target URL"
                  className="w-full bg-[#11141B] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-white/[0.25]"
                />
              )}

              {(selectedAction === 'click' ||
                selectedAction === 'fill' ||
                selectedAction === 'pressKey') && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Locator strategy"
                      value={locatorStrategy}
                      onChange={(e) =>
                        setLocatorStrategy(e.target.value as LocatorStrategy)
                      }
                      className="bg-[#11141B] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-neutral-200 focus:outline-none"
                    >
                      <option value="role">By Role</option>
                      <option value="label">By Label</option>
                      <option value="placeholder">By Placeholder</option>
                      <option value="text">By Text</option>
                    </select>

                    {locatorStrategy === 'role' && (
                      <select
                        aria-label="Accessible role"
                        value={ariaRole}
                        onChange={(e) =>
                          setAriaRole(e.target.value as SupportedAriaRole)
                        }
                        className="bg-[#11141B] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-neutral-200 focus:outline-none"
                      >
                        <option value="button">button</option>
                        <option value="link">link</option>
                        <option value="textbox">textbox</option>
                        <option value="searchbox">searchbox</option>
                        <option value="checkbox">checkbox</option>
                        <option value="combobox">combobox</option>
                        <option value="heading">heading</option>
                      </select>
                    )}

                    <input
                      type="text"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder={
                        selectedAction === 'pressKey'
                          ? 'Optional focus target name'
                          : 'Accessible name / label / text'
                      }
                      aria-label="Target accessible name or label"
                      className="flex-1 min-w-0 bg-[#11141B] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-white/[0.25]"
                    />
                  </div>

                  {selectedAction === 'fill' && (
                    <input
                      type="text"
                      value={fillValue}
                      onChange={(e) => setFillValue(e.target.value)}
                      placeholder="Text value to fill"
                      aria-label="Text value to fill"
                      className="w-full bg-[#11141B] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-white/[0.25]"
                    />
                  )}
                </div>
              )}

              {selectedAction === 'scroll' && (
                <select
                  aria-label="Scroll direction"
                  value={scrollDirection}
                  onChange={(e) =>
                    setScrollDirection(e.target.value as ScrollDirection)
                  }
                  className="w-full bg-[#11141B] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs text-neutral-100 focus:outline-none"
                >
                  <option value="down">Scroll Down</option>
                  <option value="up">Scroll Up</option>
                  <option value="bottom">Scroll to Bottom</option>
                  <option value="top">Scroll to Top</option>
                </select>
              )}

              {selectedAction === 'pressKey' && (
                <select
                  aria-label="Keyboard key"
                  value={keyToPress}
                  onChange={(e) => setKeyToPress(e.target.value as AllowedKey)}
                  className="w-full bg-[#11141B] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs font-mono text-neutral-100 focus:outline-none"
                >
                  <option value="Enter">Enter</option>
                  <option value="Tab">Tab</option>
                  <option value="Escape">Escape</option>
                  <option value="ArrowDown">ArrowDown</option>
                  <option value="ArrowUp">ArrowUp</option>
                  <option value="Backspace">Backspace</option>
                  <option value="Space">Space</option>
                </select>
              )}
            </form>

            {/* Real Verified Action Response or Error Output */}
            {lastActionResponse && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-2 ${
                  lastActionResponse.success
                    ? 'bg-[#11141B] border-white/[0.08] text-neutral-200'
                    : lastActionResponse.approvalRequired
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
                data-testid="browser-action-result"
              >
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span>
                    {lastActionResponse.action} ·{' '}
                    {lastActionResponse.success
                      ? 'Verified'
                      : lastActionResponse.approvalRequired
                      ? 'Approval Required'
                      : lastActionResponse.error?.code || 'Failed'}
                  </span>
                  <span className="text-neutral-400 tabular-nums">
                    {lastActionResponse.timestamp}
                  </span>
                </div>

                {!lastActionResponse.success && lastActionResponse.error && (
                  <div className="flex items-start gap-2">
                    {lastActionResponse.approvalRequired ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-2">
                      <p className="leading-relaxed">
                        {lastActionResponse.error.message}
                      </p>
                      {lastActionResponse.pendingOrigin && (
                        <button
                          type="button"
                          onClick={handleApproveExternalOrigin}
                          disabled={isExecutingAction}
                          className="px-2.5 py-1 rounded bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-100 text-[11px] font-medium cursor-pointer"
                        >
                          Allow navigation to {lastActionResponse.pendingOrigin}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {lastActionResponse.success && inspectionResult && (
                  <div className="space-y-2 text-[11px] text-neutral-300 border-t border-white/[0.06] pt-2">
                    <p className="leading-relaxed">
                      {inspectionResult.conciseSummary}
                    </p>
                    {inspectionResult.buttons.length > 0 && (
                      <div className="font-mono text-neutral-400">
                        Buttons:{' '}
                        {inspectionResult.buttons
                          .map(
                            (b) =>
                              `${b.text}${
                                b.isConsequential ? ' [requires approval]' : ''
                              }`
                          )
                          .join(', ')}
                      </div>
                    )}
                    {inspectionResult.inputs.length > 0 && (
                      <div className="font-mono text-neutral-400">
                        Inputs:{' '}
                        {inspectionResult.inputs
                          .map(
                            (inp) =>
                              `${inp.label || inp.placeholder || inp.type}${
                                inp.valuePreview
                                  ? `="${inp.valuePreview}"`
                                  : ''
                              }`
                          )
                          .join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {lastActionResponse.success &&
                  !inspectionResult &&
                  lastActionResponse.result && (
                    <pre className="font-mono text-[11px] text-neutral-300 whitespace-pre-wrap break-all border-t border-white/[0.06] pt-2">
                      {JSON.stringify(lastActionResponse.result, null, 2)}
                    </pre>
                  )}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
