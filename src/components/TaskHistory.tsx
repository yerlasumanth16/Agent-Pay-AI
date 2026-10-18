import React from 'react';
import { TaskRecord } from '../types/agentpay';

interface TaskHistoryProps {
  tasks: TaskRecord[];
  activeTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

export const TaskHistory: React.FC<TaskHistoryProps> = ({
  tasks,
  activeTaskId,
  onSelectTask,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="px-2.5 py-3 text-xs text-neutral-500">
        No tasks yet.
      </div>
    );
  }

  return (
    <div className="space-y-0.5" role="list" aria-label="Task history">
      {tasks.map((task) => {
        const isActive = task.id === activeTaskId;
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelectTask(task.id)}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors cursor-pointer ${
              isActive
                ? 'bg-white/[0.08] text-white font-medium'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
            }`}
          >
            <span className="truncate">{task.title}</span>
            <span className="font-mono text-[10px] text-neutral-500 shrink-0 tabular-nums">
              {task.createdAt}
            </span>
          </button>
        );
      })}
    </div>
  );
};
