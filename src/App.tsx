import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { TaskRecord } from './types/agentpay';
import { ManagedBrowserSessionInfo } from './types/browserHealth';
import {
  fetchBrowserSessionStatus,
  startBrowserSession,
  refreshBrowserScreenshot,
  closeBrowserSession,
} from './services/browserSessionClient';
import { Sidebar } from './components/Sidebar';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { TaskWorkspace } from './components/TaskWorkspace';
import { BrowserPanel } from './components/BrowserPanel';
import { SettingsDialog } from './components/SettingsDialog';

function getCurrentTimeStr(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const INITIAL_BROWSER_SESSION: ManagedBrowserSessionInfo = {
  state: 'Not connected',
  connected: false,
  sessionId: null,
  browserVersion: null,
  currentUrl: null,
  pageTitle: null,
  extractedHeading: null,
  extractedSummary: null,
  screenshotDataUrl: null,
  screenshotCount: 0,
  startedAt: null,
  lastUpdatedAt: getCurrentTimeStr(),
  lastScreenshotAt: null,
  errorMessage: null,
};

export default function App() {
  // Genuine user-submitted tasks only (never seeded with fictional tasks)
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Prompt composer state
  const [composerValue, setComposerValue] = useState('');
  const [composerFocusTrigger, setComposerFocusTrigger] = useState(0);

  // Layout & Dialog state (Browser panel is optional & collapsible)
  const [isBrowserPanelOpen, setIsBrowserPanelOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Real Server-Side Playwright Browser Session State
  const [browserSession, setBrowserSession] =
    useState<ManagedBrowserSessionInfo>(INITIAL_BROWSER_SESSION);
  const isBrowserRequestInFlightRef = useRef(false);

  // Check actual server-side browser session status on mount
  useEffect(() => {
    let mounted = true;
    fetchBrowserSessionStatus()
      .then((status) => {
        if (!mounted) return;
        setBrowserSession(status);
        if (status.connected) {
          setIsBrowserPanelOpen(true);
        }
      })
      .catch(() => {
        // Keep initial disconnected state if unreachable
      });
    return () => {
      mounted = false;
    };
  }, []);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) || null,
    [tasks, activeTaskId]
  );

  // Helper to append a genuine event to the currently active task
  const appendTaskEvent = useCallback(
    (taskId: string, description: string, status: 'info' | 'error' = 'info') => {
      const timestamp = getCurrentTimeStr();
      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== taskId) return task;
          return {
            ...task,
            events: [
              ...task.events,
              {
                id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp,
                description,
                status,
              },
            ],
          };
        })
      );
    },
    []
  );

  // Start a new task workspace
  const handleNewTask = useCallback(() => {
    setActiveTaskId(null);
    setComposerValue('');
    setComposerFocusTrigger((c) => c + 1);
  }, []);

  // Submit a natural-language task (Honest non-simulated handling)
  const handleSubmitPrompt = useCallback(
    (promptText: string) => {
      const now = getCurrentTimeStr();
      const unavailableNotice =
        'Agent runtime is not connected. Your instruction has been saved to this session, but automated task execution is not yet connected to an AI backend.';

      if (!activeTaskId) {
        const newId = `task-${Date.now()}`;
        const shortTitle =
          promptText.length > 48 ? `${promptText.slice(0, 48)}...` : promptText;

        const newTask: TaskRecord = {
          id: newId,
          title: shortTitle,
          prompt: promptText,
          createdAt: now,
          state: 'Agent runtime not connected',
          messages: [
            {
              id: `msg-u-${Date.now()}`,
              role: 'user',
              content: promptText,
              timestamp: now,
            },
            {
              id: `msg-s-${Date.now() + 1}`,
              role: 'system',
              content: unavailableNotice,
              timestamp: now,
            },
          ],
          events: [
            {
              id: `ev-${Date.now()}`,
              timestamp: now,
              description: 'Task recorded. Agent runtime not connected.',
              status: 'error',
            },
          ],
        };

        setTasks((prev) => [newTask, ...prev]);
        setActiveTaskId(newId);
      } else {
        setTasks((prev) =>
          prev.map((task) => {
            if (task.id !== activeTaskId) return task;
            return {
              ...task,
              messages: [
                ...task.messages,
                {
                  id: `msg-u-${Date.now()}`,
                  role: 'user',
                  content: promptText,
                  timestamp: now,
                },
                {
                  id: `msg-s-${Date.now() + 1}`,
                  role: 'system',
                  content: unavailableNotice,
                  timestamp: now,
                },
              ],
              events: [
                ...task.events,
                {
                  id: `ev-${Date.now()}`,
                  timestamp: now,
                  description:
                    'Follow-up instruction recorded. Agent runtime not connected.',
                  status: 'error',
                },
              ],
            };
          })
        );
      }

      setComposerValue('');
    },
    [activeTaskId]
  );

  // Real Browser Session Controls (Connected to server-side Playwright)
  const handleStartBrowser = useCallback(async () => {
    if (isBrowserRequestInFlightRef.current) return;
    isBrowserRequestInFlightRef.current = true;

    setBrowserSession((prev) => ({
      ...prev,
      state: 'Starting',
      errorMessage: null,
    }));

    try {
      const updated = await startBrowserSession();
      setBrowserSession(updated);
      if (updated.connected && activeTaskId) {
        appendTaskEvent(
          activeTaskId,
          `Browser session connected (${updated.sessionId}) at ${
            updated.currentUrl || 'local target'
          }.`,
          'info'
        );
      } else if (updated.errorMessage && activeTaskId) {
        appendTaskEvent(activeTaskId, updated.errorMessage, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBrowserSession({
        ...INITIAL_BROWSER_SESSION,
        state: 'Error',
        errorMessage: msg,
        lastUpdatedAt: getCurrentTimeStr(),
      });
      if (activeTaskId) {
        appendTaskEvent(activeTaskId, msg, 'error');
      }
    } finally {
      isBrowserRequestInFlightRef.current = false;
    }
  }, [activeTaskId, appendTaskEvent]);

  const handleRefreshScreenshot = useCallback(async () => {
    if (isBrowserRequestInFlightRef.current) return;
    isBrowserRequestInFlightRef.current = true;

    setBrowserSession((prev) => ({
      ...prev,
      state: 'Capturing screenshot',
      errorMessage: null,
    }));

    try {
      const updated = await refreshBrowserScreenshot();
      setBrowserSession(updated);
      if (updated.connected && activeTaskId) {
        appendTaskEvent(
          activeTaskId,
          `Captured browser screenshot at ${updated.lastScreenshotAt}.`,
          'info'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBrowserSession((prev) => ({
        ...prev,
        state: 'Error',
        connected: false,
        errorMessage: msg,
        lastUpdatedAt: getCurrentTimeStr(),
      }));
      if (activeTaskId) {
        appendTaskEvent(activeTaskId, msg, 'error');
      }
    } finally {
      isBrowserRequestInFlightRef.current = false;
    }
  }, [activeTaskId, appendTaskEvent]);

  const handleCloseBrowser = useCallback(async () => {
    if (isBrowserRequestInFlightRef.current) return;
    isBrowserRequestInFlightRef.current = true;

    setBrowserSession((prev) => ({
      ...prev,
      state: 'Closing',
      errorMessage: null,
    }));

    try {
      const updated = await closeBrowserSession();
      setBrowserSession(updated);
      if (activeTaskId) {
        appendTaskEvent(activeTaskId, 'Browser session closed.', 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBrowserSession({
        ...INITIAL_BROWSER_SESSION,
        state: 'Error',
        errorMessage: msg,
        lastUpdatedAt: getCurrentTimeStr(),
      });
      if (activeTaskId) {
        appendTaskEvent(activeTaskId, msg, 'error');
      }
    } finally {
      isBrowserRequestInFlightRef.current = false;
    }
  }, [activeTaskId, appendTaskEvent]);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#0B0D11] text-[#E6E8EE]">
      {/* A. Slim Left Sidebar */}
      <Sidebar
        tasks={tasks}
        activeTaskId={activeTaskId}
        onNewTask={handleNewTask}
        onSelectTask={(id) => setActiveTaskId(id)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Column: Top Header + Centre Workspace + Optional Browser Panel + Minimal Active Task Status Bar */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {/* D. Small Top Toolbar */}
        <WorkspaceHeader
          taskTitle={activeTask ? activeTask.title : null}
          agentRuntimeStatus={
            activeTask ? activeTask.state : 'Agent runtime not connected'
          }
          browserSession={browserSession}
          isBrowserPanelOpen={isBrowserPanelOpen}
          onToggleBrowserPanel={() => setIsBrowserPanelOpen((prev) => !prev)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        />

        {/* B & C. Main Conversation Workspace + Optional Collapsible Browser Panel */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          <main className="flex-1 min-w-0 h-full overflow-y-auto flex flex-col">
            <TaskWorkspace
              activeTask={activeTask}
              composerValue={composerValue}
              onComposerChange={setComposerValue}
              onSubmitPrompt={handleSubmitPrompt}
              autoFocusTrigger={composerFocusTrigger}
              onOpenBrowserPanel={() => setIsBrowserPanelOpen(true)}
              isBrowserConnected={browserSession.connected}
            />
          </main>

          {/* Desktop Optional Collapsible Browser Panel */}
          {isBrowserPanelOpen && (
            <div className="hidden lg:block w-[420px] xl:w-[460px] h-full shrink-0">
              <BrowserPanel
                session={browserSession}
                onStartBrowser={handleStartBrowser}
                onRefreshScreenshot={handleRefreshScreenshot}
                onCloseBrowser={handleCloseBrowser}
                onCollapsePanel={() => setIsBrowserPanelOpen(false)}
              />
            </div>
          )}

          {/* Tablet / Mobile Browser Panel Drawer */}
          {isBrowserPanelOpen && (
            <div className="fixed inset-0 z-40 lg:hidden flex justify-end">
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                onClick={() => setIsBrowserPanelOpen(false)}
                aria-hidden="true"
              />
              <div className="relative z-10 w-full max-w-md h-full">
                <BrowserPanel
                  session={browserSession}
                  onStartBrowser={handleStartBrowser}
                  onRefreshScreenshot={handleRefreshScreenshot}
                  onCloseBrowser={handleCloseBrowser}
                  onCollapsePanel={() => setIsBrowserPanelOpen(false)}
                />
              </div>
            </div>
          )}
        </div>

        {/* E. Minimal Bottom Execution-Status Area (Shown only when a task is active) */}
        {activeTask && (
          <footer className="h-8 shrink-0 bg-[#090B0E] border-t border-white/[0.07] px-4 flex items-center justify-between gap-4 text-[11px] font-mono text-neutral-400 select-none">
            <div className="flex items-center gap-2 truncate">
              <span>{activeTask.state}</span>
              <span aria-hidden="true" className="text-white/20">
                ·
              </span>
              <span
                className={
                  browserSession.connected
                    ? 'text-emerald-300'
                    : 'text-neutral-400'
                }
              >
                {browserSession.connected
                  ? `Browser connected (${browserSession.pageTitle || 'Active'})`
                  : 'Browser disconnected'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsBrowserPanelOpen((prev) => !prev)}
              className="text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {isBrowserPanelOpen ? 'Hide Browser Preview' : 'Show Browser Preview'}
            </button>
          </footer>
        )}
      </div>

      {/* Settings & Collapsible Developer Diagnostics Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        browserSession={browserSession}
      />
    </div>
  );
}
