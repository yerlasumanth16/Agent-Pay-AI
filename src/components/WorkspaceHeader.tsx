import React from 'react';
import { Menu, PanelRight, Settings } from 'lucide-react';
import { ManagedBrowserSessionInfo } from '../types/browserHealth';

interface WorkspaceHeaderProps {
  taskTitle: string | null;
  agentRuntimeStatusLabel: string;
  isGeminiConfigured: boolean;
  browserSession: ManagedBrowserSessionInfo;
  isBrowserPanelOpen: boolean;
  onToggleBrowserPanel: () => void;
  onOpenSettings: () => void;
  onToggleMobileSidebar: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  taskTitle,
  agentRuntimeStatusLabel,
  isGeminiConfigured,
  browserSession,
  isBrowserPanelOpen,
  onToggleBrowserPanel,
  onOpenSettings,
  onToggleMobileSidebar,
}) => {
  const browserStatusLabel = browserSession.connected
    ? 'Browser connected'
    : browserSession.state === 'Starting'
    ? 'Browser starting'
    : browserSession.state === 'Closing'
    ? 'Browser closing'
    : browserSession.state === 'Capturing screenshot'
    ? 'Capturing screenshot'
    : 'Browser disconnected';

  return (
    <header className="h-12 shrink-0 bg-[#0B0D11] border-b border-white/[0.07] px-3 sm:px-5 flex items-center justify-between gap-4 z-20">
      {/* Left: Mobile Sidebar Toggle & Current Task Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
          aria-label="Open navigation sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>

        <span className="text-xs font-medium text-neutral-200 truncate">
          {taskTitle || 'Workspace'}
        </span>
      </div>

      {/* Right: Honest Status Labels & Panel Controls */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden md:flex items-center gap-2.5 text-xs text-neutral-400 whitespace-nowrap">
          <span
            className={
              isGeminiConfigured ? 'text-neutral-200' : 'text-neutral-400'
            }
          >
            {agentRuntimeStatusLabel}
          </span>
          <span aria-hidden="true" className="text-white/20">
            ·
          </span>
          <span
            className={
              browserSession.connected ? 'text-emerald-300' : 'text-neutral-400'
            }
          >
            {browserStatusLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleBrowserPanel}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
            isBrowserPanelOpen
              ? 'bg-white/[0.09] text-white border-white/[0.15]'
              : 'bg-transparent text-neutral-400 border-white/[0.07] hover:text-white hover:bg-white/[0.04]'
          }`}
          aria-expanded={isBrowserPanelOpen}
          title="Toggle Browser Preview panel"
        >
          <PanelRight className="w-3.5 h-3.5" />
          <span>Browser Preview</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
          aria-label="Open Settings"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
