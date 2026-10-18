import React from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { TaskRecord } from '../types/agentpay';
import { PromptComposer } from './PromptComposer';

interface TaskWorkspaceProps {
  activeTask: TaskRecord | null;
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSubmitPrompt: (prompt: string) => void;
  isProcessingPrompt: boolean;
  autoFocusTrigger: number;
  onOpenBrowserPanel: () => void;
  isBrowserConnected: boolean;
  onApproveOriginFromChat?: (origin: string) => void;
}

export const TaskWorkspace: React.FC<TaskWorkspaceProps> = ({
  activeTask,
  composerValue,
  onComposerChange,
  onSubmitPrompt,
  isProcessingPrompt,
  autoFocusTrigger,
  onOpenBrowserPanel,
  isBrowserConnected,
  onApproveOriginFromChat,
}) => {
  // 1. Initial Minimalist Empty Workspace
  if (!activeTask) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-2xl space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <h1 className="font-display font-semibold text-2xl sm:text-3xl text-white tracking-tight">
              What can I help you do?
            </h1>
            <p className="text-sm text-neutral-400">
              Describe the task you want AgentPay to handle.
            </p>
          </div>

          <PromptComposer
            value={composerValue}
            onChange={onComposerChange}
            onSubmit={onSubmitPrompt}
            isProcessing={isProcessingPrompt}
            autoFocusTrigger={autoFocusTrigger}
          />
        </div>
      </div>
    );
  }

  // 2. Active Task Workspace (Genuine Conversation, Tool Status & Real Backend Events Only)
  return (
    <div className="flex-1 flex flex-col justify-between max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 gap-8">
      <div className="space-y-6">
        {/* Task Header */}
        <div className="pb-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display font-semibold text-base sm:text-lg text-white">
            {activeTask.title}
          </h1>
          <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
            <span>{activeTask.state}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{activeTask.createdAt}</span>
          </div>
        </div>

        {/* Conversation Thread */}
        <div
          className="space-y-6 divide-y divide-white/[0.06]"
          data-testid="conversation-thread"
        >
          {activeTask.messages.map((msg) => (
            <div key={msg.id} className="pt-5 first:pt-0 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium ${
                      msg.role === 'user'
                        ? 'text-neutral-300'
                        : msg.isError
                        ? 'text-rose-300'
                        : 'text-white'
                    }`}
                  >
                    {msg.role === 'user'
                      ? 'You'
                      : msg.role === 'assistant'
                      ? 'AgentPay AI'
                      : 'System'}
                  </span>
                  {msg.model && (
                    <span className="font-mono text-[11px] text-neutral-500">
                      {msg.model}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-neutral-500 tabular-nums">
                  {msg.timestamp}
                </span>
              </div>

              {/* Genuine Server-Side Browser Tool Action Status & Result */}
              {msg.toolExecution && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                    msg.toolExecution.toolSuccess
                      ? 'bg-[#11141B] border-white/[0.08] text-neutral-200'
                      : msg.toolExecution.approvalRequired
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`}
                  data-testid="tool-execution-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span
                        className="font-medium text-neutral-100"
                        data-testid="tool-status-label"
                      >
                        {msg.toolExecution.statusLabel}
                      </span>
                      <span className="text-neutral-500">
                        ({msg.toolExecution.toolName})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {msg.toolExecution.toolSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-emerald-300">Completed</span>
                        </>
                      ) : msg.toolExecution.approvalRequired ? (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-amber-300">
                            Approval required
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="text-rose-300">
                            {msg.toolExecution.error?.code || 'Failed'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <p
                    className="text-xs text-neutral-300 leading-relaxed"
                    data-testid="tool-execution-summary"
                  >
                    {msg.toolExecution.summary}
                  </p>

                  {msg.toolExecution.pendingOrigin && onApproveOriginFromChat && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          onApproveOriginFromChat(
                            msg.toolExecution!.pendingOrigin!
                          )
                        }
                        className="px-2.5 py-1 rounded bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-100 text-[11px] font-medium cursor-pointer"
                      >
                        Allow navigation to {msg.toolExecution.pendingOrigin}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {msg.isError ? (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-200"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </span>
                </div>
              ) : (
                <div
                  className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap"
                  data-testid={
                    msg.role === 'assistant' ? 'gemini-response' : 'user-message'
                  }
                >
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {isProcessingPrompt && (
            <div className="pt-5 flex items-center gap-2.5 text-xs text-neutral-400 font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-300" />
              <span>Processing request...</span>
            </div>
          )}
        </div>

        {/* Genuine Execution Events Log (Only real backend/system events) */}
        {activeTask.events.length > 0 && (
          <div className="pt-4 border-t border-white/[0.07] space-y-2">
            <div className="text-xs font-medium text-neutral-400">
              Execution Log
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              {activeTask.events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 text-neutral-400"
                >
                  <span className="text-neutral-500 tabular-nums shrink-0">
                    {ev.timestamp}
                  </span>
                  <span
                    className={
                      ev.status === 'error'
                        ? 'text-amber-300/90'
                        : 'text-neutral-300'
                    }
                  >
                    {ev.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Helpful link to open the real Playwright Browser Preview */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onOpenBrowserPanel}
            className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
          >
            {isBrowserConnected
              ? 'View active Chromium session in Browser Preview'
              : 'Open Browser Preview to start a server-side Chromium session'}
          </button>
        </div>
      </div>

      {/* Bottom Prompt Composer */}
      <div className="pt-4 border-t border-white/[0.07]">
        <PromptComposer
          value={composerValue}
          onChange={onComposerChange}
          onSubmit={onSubmitPrompt}
          isProcessing={isProcessingPrompt}
          autoFocusTrigger={autoFocusTrigger}
        />
      </div>
    </div>
  );
};
