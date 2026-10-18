import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ManagedBrowserSessionInfo } from '../types/browserHealth';
import { DeveloperDiagnostics } from './DeveloperDiagnostics';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  browserSession: ManagedBrowserSessionInfo;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  browserSession,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-[#11141B] border border-white/[0.1] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/[0.07] flex items-center justify-between">
          <h2
            id="settings-dialog-title"
            className="font-display font-semibold text-sm text-white"
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Rows */}
        <div className="p-4 space-y-4 text-xs">
          <div className="divide-y divide-white/[0.06]">
            <div className="py-2.5 first:pt-0 flex items-center justify-between gap-4">
              <span className="text-neutral-400">AI runtime status</span>
              <span className="font-mono text-neutral-200">
                Agent runtime not connected
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-neutral-400">Browser session status</span>
              <span
                className={`font-mono ${
                  browserSession.connected
                    ? 'text-emerald-300'
                    : 'text-neutral-200'
                }`}
              >
                {browserSession.connected
                  ? 'Browser connected'
                  : 'Browser disconnected'}
              </span>
            </div>

            <div className="py-2.5 last:pb-0 flex items-center justify-between gap-4">
              <span className="text-neutral-400">
                Payment integration status
              </span>
              <span className="font-mono text-neutral-200">Not configured</span>
            </div>
          </div>

          {/* Collapsible Developer Diagnostics */}
          <DeveloperDiagnostics session={browserSession} />
        </div>
      </div>
    </div>
  );
};
