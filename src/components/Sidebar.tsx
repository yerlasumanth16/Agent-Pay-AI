import React from 'react';
import { Plus, Settings, X, MessageSquare } from 'lucide-react';
import { TaskRecord } from '../types/agentpay';
import { TaskHistory } from './TaskHistory';

interface SidebarProps {
  tasks: TaskRecord[];
  activeTaskId: string | null;
  onNewTask: () => void;
  onSelectTask: (taskId: string) => void;
  onOpenSettings: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tasks,
  activeTaskId,
  onNewTask,
  onSelectTask,
  onOpenSettings,
  mobileOpen,
  onCloseMobile,
}) => {
  const sidebarBody = (
    <aside
      aria-label="Workspace navigation"
      className="w-60 h-full bg-[#0C0E12] border-r border-white/[0.07] flex flex-col justify-between select-none shrink-0"
    >
      <div className="p-3 space-y-4 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              onNewTask();
              onCloseMobile();
            }}
            className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer"
          >
            {/* Original AgentPay AI Geometric Emblem */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0 text-neutral-200"
              aria-hidden="true"
            >
              <rect
                x="2.5"
                y="2.5"
                width="19"
                height="19"
                rx="4.5"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M7.5 15.5L12 7.5L16.5 15.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.2 13H14.8"
                stroke="#818CF8"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-display font-semibold text-sm tracking-tight text-white">
              AgentPay AI
            </span>
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1 text-neutral-400 hover:text-white rounded"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Task Button */}
        <div>
          <button
            type="button"
            onClick={() => {
              onNewTask();
              onCloseMobile();
            }}
            className="w-full py-2 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.14] border border-white/[0.08] text-neutral-100 font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-neutral-300" />
            <span>New Task</span>
          </button>
        </div>

        {/* Workspace Link */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onNewTask();
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
              activeTaskId === null
                ? 'bg-white/[0.06] text-white font-medium'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
            <span>Workspace</span>
          </button>
        </div>

        {/* Genuine Task History */}
        <div className="pt-2 border-t border-white/[0.06] space-y-1">
          <div className="px-2.5 py-1 text-[11px] font-medium text-neutral-500">
            Tasks
          </div>
          <TaskHistory
            tasks={tasks}
            activeTaskId={activeTaskId}
            onSelectTask={(id) => {
              onSelectTask(id);
              onCloseMobile();
            }}
          />
        </div>
      </div>

      {/* Bottom Settings Access */}
      <div className="p-3 border-t border-white/[0.07]">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-full shrink-0">{sidebarBody}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
