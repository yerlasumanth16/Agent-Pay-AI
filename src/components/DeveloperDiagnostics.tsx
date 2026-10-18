import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Play } from 'lucide-react';
import {
  BrowserHealthCheckResult,
  ManagedBrowserSessionInfo,
} from '../types/browserHealth';
import { runBrowserDiagnosticCheck } from '../services/browserSessionClient';

interface DeveloperDiagnosticsProps {
  session: ManagedBrowserSessionInfo;
}

export const DeveloperDiagnostics: React.FC<DeveloperDiagnosticsProps> = ({
  session,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [diagnosticResult, setDiagnosticResult] =
    useState<BrowserHealthCheckResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  const handleRunDiagnostic = async () => {
    if (isRunningCheck) return;
    setIsRunningCheck(true);
    setDiagnosticError(null);
    try {
      const res = await runBrowserDiagnosticCheck();
      setDiagnosticResult(res);
    } catch (err: unknown) {
      setDiagnosticError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningCheck(false);
    }
  };

  return (
    <div className="border-t border-white/[0.07] pt-3">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between py-1.5 text-left text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
        aria-expanded={expanded}
      >
        <span>Developer Diagnostics</span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-xs">
          <div className="rounded-lg bg-[#0A0C10] border border-white/[0.06] p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="text-neutral-500">Session State</span>
              <span className="text-neutral-200">{session.state}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-500">Session ID</span>
              <span className="text-neutral-300">
                {session.sessionId || 'None'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-500">Chromium Version</span>
              <span className="text-neutral-300">
                {session.browserVersion || 'Not running'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-500">Screenshots Captured</span>
              <span className="text-neutral-300 tabular-nums">
                {session.screenshotCount}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-neutral-400">
              One-shot Playwright launch &amp; teardown test
            </span>
            <button
              type="button"
              onClick={handleRunDiagnostic}
              disabled={isRunningCheck}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-45 text-neutral-200 border border-white/[0.08] text-[11px] font-medium transition-colors cursor-pointer"
            >
              {isRunningCheck ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Run Check</span>
                </>
              )}
            </button>
          </div>

          {diagnosticError && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200 font-mono">
              {diagnosticError}
            </div>
          )}

          {diagnosticResult && (
            <div className="rounded-lg bg-[#0A0C10] border border-white/[0.06] p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500">Result</span>
                <span
                  className={
                    diagnosticResult.success
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                  }
                >
                  {diagnosticResult.success
                    ? `Passed (${diagnosticResult.durationMs}ms)`
                    : `Failed (${diagnosticResult.diagnostic.blockerCategory})`}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500">Binary</span>
                <span className="text-neutral-300 truncate max-w-[220px]">
                  {diagnosticResult.executablePathChecked || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500">Page Title Read</span>
                <span className="text-neutral-300 truncate max-w-[220px]">
                  {diagnosticResult.pageTitle || 'None'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500">Closed Cleanly</span>
                <span className="text-neutral-300">
                  {diagnosticResult.browserClosedCleanly ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
