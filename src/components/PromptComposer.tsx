import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, AlertCircle } from 'lucide-react';

interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (promptText: string) => void;
  isProcessing?: boolean;
  isTaskRunning?: boolean;
  onStop?: () => void;
  autoFocusTrigger?: number;
}

export const PromptComposer: React.FC<PromptComposerProps> = ({
  value,
  onChange,
  onSubmit,
  isProcessing = false,
  isTaskRunning = false,
  onStop,
  autoFocusTrigger,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocusTrigger !== undefined && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocusTrigger]);

  const handleTriggerSubmit = () => {
    if (isProcessing || isTaskRunning) return;

    const trimmed = value.trim();
    if (!trimmed) {
      setValidationError('Enter a task description before submitting.');
      textareaRef.current?.focus();
      return;
    }

    setValidationError(null);
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTriggerSubmit();
    }
  };

  return (
    <div className="w-full space-y-2">
      <div
        className={`rounded-xl bg-[#11141B] border transition-colors ${
          validationError
            ? 'border-rose-500/60 focus-within:border-rose-400'
            : 'border-white/[0.1] focus-within:border-white/[0.24]'
        }`}
      >
        <div className="p-3.5">
          <textarea
            ref={textareaRef}
            rows={3}
            value={value}
            disabled={isProcessing}
            onChange={(e) => {
              if (validationError) setValidationError(null);
              onChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe a task for AgentPay..."
            aria-label="Describe a task for AgentPay"
            className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-500 resize-none focus:outline-none disabled:opacity-50 leading-relaxed"
          />
        </div>

        <div className="px-3.5 pb-3 pt-1 flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500">
            Enter to submit · Shift+Enter for new line
          </span>

          {isTaskRunning && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Square className="w-3 h-3" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTriggerSubmit}
              disabled={isProcessing}
              aria-label="Submit task"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-white disabled:opacity-40 text-neutral-950 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Submit</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          className="flex items-center gap-2 text-xs text-rose-300 px-1"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
