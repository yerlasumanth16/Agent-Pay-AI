export type TaskExecutionState =
  | 'Agent runtime not connected'
  | 'Task running'
  | 'Waiting for approval'
  | 'Completed'
  | 'Failed'
  | 'Stopped';

export interface TaskMessage {
  id: string;
  role: 'user' | 'system';
  content: string;
  timestamp: string;
}

export interface TaskEvent {
  id: string;
  timestamp: string;
  description: string;
  status: 'info' | 'error';
}

export interface TaskRecord {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  state: TaskExecutionState;
  messages: TaskMessage[];
  events: TaskEvent[];
  errorMessage?: string;
}
