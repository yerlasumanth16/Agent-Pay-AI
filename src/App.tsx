import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  AgentRuntimeStatusResponse,
  ConversationHistoryTurn,
  TaskEvent,
  TaskRecord,
} from './types/agentpay';
import { ManagedBrowserSessionInfo } from './types/browserHealth';
import {
  BrowserActionRequest,
  BrowserActionResponse,
} from './types/browserActions';
import {
  fetchBrowserSessionStatus,
  startBrowserSession,
  refreshBrowserScreenshot,
  closeBrowserSession,
  sendBrowserAction,
  fetchAgentRuntimeStatus,
  sendAgentChatMessage,
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

const INITIAL_AGENT_RUNTIME: AgentRuntimeStatusResponse = {
  configured: false,
  model: 'gemini-3.1-flash-lite',
  statusLabel: 'Checking AI runtime...',
  toolDeclarationsCount: 0,
  registeredTools: [],
};

export default function App() {
  // Genuine user-submitted tasks only (never seeded with fictional tasks)
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);

  // Prompt composer state
  const [composerValue, setComposerValue] = useState('');
  const [composerFocusTrigger, setComposerFocusTrigger] = useState(0);

  // Layout & Dialog state (Browser panel is optional & collapsible)
  const [isBrowserPanelOpen, setIsBrowserPanelOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Real Server-Side Gemini Runtime Status
  const [agentRuntime, setAgentRuntime] =
    useState<AgentRuntimeStatusResponse>(INITIAL_AGENT_RUNTIME);

  // Real Server-Side Playwright Browser Session State
  const [browserSession, setBrowserSession] =
    useState<ManagedBrowserSessionInfo>(INITIAL_BROWSER_SESSION);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [lastActionResponse, setLastActionResponse] =
    useState<BrowserActionResponse | null>(null);
  const isBrowserRequestInFlightRef = useRef(false);

  // Check actual server-side Gemini & Playwright browser session statuses on mount
  useEffect(() => {
    let mounted = true;

    fetchAgentRuntimeStatus()
      .then((runtimeStatus) => {
        if (!mounted) return;
        setAgentRuntime(runtimeStatus);
      })
      .catch(() => {
        if (!mounted) return;
        setAgentRuntime({
          configured: false,
          model: 'gemini-3.1-flash-lite',
          statusLabel: 'AI runtime unreachable',
          toolDeclarationsCount: 0,
          registeredTools: [],
        });
      });

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

  // Submit a natural-language prompt to the server-side Gemini function-calling endpoint
  const handleSubmitPrompt = useCallback(
    async (promptText: string) => {
      if (isProcessingPrompt) return;

      const now = getCurrentTimeStr();
      let targetTaskId = activeTaskId;
      let priorHistory: ConversationHistoryTurn[] = [];

      if (!targetTaskId) {
        targetTaskId = `task-${Date.now()}`;
        const shortTitle =
          promptText.length > 48 ? `${promptText.slice(0, 48)}...` : promptText;

        const newTask: TaskRecord = {
          id: targetTaskId,
          title: shortTitle,
          prompt: promptText,
          createdAt: now,
          state: 'Task running',
          messages: [
            {
              id: `msg-u-${Date.now()}`,
              role: 'user',
              content: promptText,
              timestamp: now,
            },
          ],
          events: [
            {
              id: `ev-${Date.now()}`,
              timestamp: now,
              description: 'Sent prompt to server-side Gemini API.',
              status: 'info',
            },
          ],
        };

        setTasks((prev) => [newTask, ...prev]);
        setActiveTaskId(targetTaskId);
      } else {
        const existingTask = tasks.find((t) => t.id === targetTaskId);
        if (existingTask) {
          priorHistory = existingTask.messages
            .filter(
              (m) =>
                (m.role === 'user' || m.role === 'assistant') && !m.isError
            )
            .map((m) => ({
              role: m.role === 'user' ? 'user' : 'model',
              content: m.content,
            }));
        }

        setTasks((prev) =>
          prev.map((task) => {
            if (task.id !== targetTaskId) return task;
            return {
              ...task,
              state: 'Task running',
              errorMessage: undefined,
              messages: [
                ...task.messages,
                {
                  id: `msg-u-${Date.now()}`,
                  role: 'user',
                  content: promptText,
                  timestamp: now,
                },
              ],
              events: [
                ...task.events,
                {
                  id: `ev-${Date.now()}`,
                  timestamp: now,
                  description: 'Sent follow-up prompt to server-side Gemini API.',
                  status: 'info',
                },
              ],
            };
          })
        );
      }

      setComposerValue('');
      setIsProcessingPrompt(true);

      try {
        const response = await sendAgentChatMessage({
          message: promptText,
          history: priorHistory,
        });

        const replyTime = getCurrentTimeStr();

        if (response.browserSession) {
          setBrowserSession(response.browserSession);
        }

        if (response.success && response.reply) {
          const newEvents: TaskEvent[] = [];

          if (response.toolExecution) {
            newEvents.push({
              id: `ev-${Date.now()}-tool-req`,
              timestamp: response.timestamp || replyTime,
              description: `${response.toolExecution.statusLabel} (${response.toolExecution.toolName})`,
              status: 'info',
            });
            newEvents.push({
              id: `ev-${Date.now()}-tool-res`,
              timestamp: response.timestamp || replyTime,
              description: response.toolExecution.summary,
              status: response.toolExecution.toolSuccess ? 'info' : 'error',
            });
          }

          newEvents.push({
            id: `ev-${Date.now()}-ok`,
            timestamp: response.timestamp || replyTime,
            description: `Received response from Gemini (${response.model}) in ${response.durationMs}ms.`,
            status: 'info',
          });

          const nextTaskState = response.toolExecution?.approvalRequired
            ? 'Waiting for approval'
            : 'Completed';

          setTasks((prev) =>
            prev.map((task) => {
              if (task.id !== targetTaskId) return task;
              return {
                ...task,
                state: nextTaskState,
                errorMessage: undefined,
                messages: [
                  ...task.messages,
                  {
                    id: `msg-a-${Date.now()}`,
                    role: 'assistant',
                    content: response.reply || '',
                    timestamp: response.timestamp || replyTime,
                    model: response.model,
                    toolExecution: response.toolExecution || null,
                  },
                ],
                events: [...task.events, ...newEvents],
              };
            })
          );
        } else {
          const errMsg =
            response.error?.message ||
            'Gemini returned an error while processing your request.';
          setTasks((prev) =>
            prev.map((task) => {
              if (task.id !== targetTaskId) return task;
              return {
                ...task,
                state: 'Failed',
                errorMessage: errMsg,
                messages: [
                  ...task.messages,
                  {
                    id: `msg-err-${Date.now()}`,
                    role: 'system',
                    content: errMsg,
                    timestamp: response.timestamp || replyTime,
                    isError: true,
                  },
                ],
                events: [
                  ...task.events,
                  {
                    id: `ev-${Date.now()}-err`,
                    timestamp: response.timestamp || replyTime,
                    description: errMsg,
                    status: 'error',
                  },
                ],
              };
            })
          );
        }
      } catch (err: unknown) {
        const errMsg =
          err instanceof Error
            ? err.message
            : 'Failed to reach server-side Gemini endpoint.';
        const errTime = getCurrentTimeStr();

        setTasks((prev) =>
          prev.map((task) => {
            if (task.id !== targetTaskId) return task;
            return {
              ...task,
              state: 'Failed',
              errorMessage: errMsg,
              messages: [
                ...task.messages,
                {
                  id: `msg-err-${Date.now()}`,
                  role: 'system',
                  content: errMsg,
                  timestamp: errTime,
                  isError: true,
                },
              ],
              events: [
                ...task.events,
                {
                  id: `ev-${Date.now()}-err`,
                  timestamp: errTime,
                  description: errMsg,
                  status: 'error',
                },
              ],
            };
          })
        );
      } finally {
        setIsProcessingPrompt(false);
      }
    },
    [activeTaskId, isProcessingPrompt, tasks]
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
      setLastActionResponse(null);
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
      setLastActionResponse(null);
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

  // Execute a real, bounded Playwright browser action on the active session
  const handleExecuteBrowserAction = useCallback(
    async (request: BrowserActionRequest) => {
      if (isBrowserRequestInFlightRef.current) return;
      isBrowserRequestInFlightRef.current = true;
      setIsExecutingAction(true);

      try {
        const response = await sendBrowserAction(request);
        setLastActionResponse(response);
        if (response.session) {
          setBrowserSession(response.session);
        }

        if (activeTaskId) {
          if (response.success) {
            appendTaskEvent(
              activeTaskId,
              `Browser action "${response.action}" verified on ${
                response.currentUrl || 'active page'
              }.`,
              'info'
            );
          } else if (response.error) {
            appendTaskEvent(
              activeTaskId,
              `Browser action "${response.action}" stopped (${response.error.code}): ${response.error.message}`,
              'error'
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastActionResponse({
          success: false,
          action: request.action,
          sessionId: browserSession.sessionId,
          result: null,
          pageTitle: browserSession.pageTitle,
          currentUrl: browserSession.currentUrl,
          screenshotDataUrl: browserSession.screenshotDataUrl,
          timestamp: getCurrentTimeStr(),
          error: {
            code: 'ACTION_EXECUTION_FAILED',
            message: msg,
          },
        });
        if (activeTaskId) {
          appendTaskEvent(activeTaskId, msg, 'error');
        }
      } finally {
        setIsExecutingAction(false);
        isBrowserRequestInFlightRef.current = false;
      }
    },
    [activeTaskId, appendTaskEvent, browserSession]
  );

  const handleApproveOriginFromChat = useCallback(
    async (origin: string) => {
      await handleExecuteBrowserAction({
        action: 'navigate',
        url: origin,
        approveOrigin: true,
      });
    },
    [handleExecuteBrowserAction]
  );

  const headerStatusLabel = useMemo(() => {
    if (isProcessingPrompt) return 'Processing request...';
    if (activeTask) return activeTask.state;
    return agentRuntime.statusLabel;
  }, [activeTask, agentRuntime.statusLabel, isProcessingPrompt]);

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
          agentRuntimeStatusLabel={headerStatusLabel}
          isGeminiConfigured={agentRuntime.configured}
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
              isProcessingPrompt={isProcessingPrompt}
              autoFocusTrigger={composerFocusTrigger}
              onOpenBrowserPanel={() => setIsBrowserPanelOpen(true)}
              isBrowserConnected={browserSession.connected}
              onApproveOriginFromChat={handleApproveOriginFromChat}
            />
          </main>

          {/* Desktop Optional Collapsible Browser Panel */}
          {isBrowserPanelOpen && (
            <div className="hidden lg:block w-[420px] xl:w-[460px] h-full shrink-0">
              <BrowserPanel
                session={browserSession}
                isExecutingAction={isExecutingAction}
                lastActionResponse={lastActionResponse}
                onStartBrowser={handleStartBrowser}
                onRefreshScreenshot={handleRefreshScreenshot}
                onCloseBrowser={handleCloseBrowser}
                onExecuteAction={handleExecuteBrowserAction}
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
                  isExecutingAction={isExecutingAction}
                  lastActionResponse={lastActionResponse}
                  onStartBrowser={handleStartBrowser}
                  onRefreshScreenshot={handleRefreshScreenshot}
                  onCloseBrowser={handleCloseBrowser}
                  onExecuteAction={handleExecuteBrowserAction}
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
        agentRuntime={agentRuntime}
      />
    </div>
  );
}
