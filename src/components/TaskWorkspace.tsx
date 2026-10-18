import React from 'react';
import { TaskRecord } from '../types/agentpay';
import { PromptComposer } from './PromptComposer';

interface TaskWorkspaceProps {
  activeTask: TaskRecord | null;
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSubmitPrompt: (prompt: string) => void;
  autoFocusTrigger: number;
  onOpenBrowserPanel: () => void;
  isBrowserConnected: boolean;
}

export const TaskWorkspace: React.FC<TaskWorkspaceProps> = ({
  activeTask,
  composerValue,
  onComposerChange,
  onSubmitPrompt,
  autoFocusTrigger,
  onOpenBrowserPanel,
  isBrowserConnected,
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
            autoFocusTrigger={autoFocusTrigger}
          />
        </div>
      </div>
    );
  }

  // 2. Active Task Workspace (Genuine Task Record Only)
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

        {/* Conversation Thread (Generous whitespace, light separators, no oversized cards) */}
        <div className="space-y-6 divide-y divide-white/[0.06]">
          {activeTask.messages.map((msg) => (
            <div key={msg.id} className="pt-5 first:pt-0 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="font-medium text-neutral-300">
                  {msg.role === 'user' ? 'You' : 'AgentPay System'}
                </span>
                <span className="font-mono text-[11px] text-neutral-500 tabular-nums">
                  {msg.timestamp}
                </span>
              </div>
              <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </p>
            </div>
          ))}
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
          autoFocusTrigger={autoFocusTrigger}
        />
      </div>
    </div>
  );
};
