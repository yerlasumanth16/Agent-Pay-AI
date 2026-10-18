import type { ManagedBrowserSessionInfo } from './browserHealth.js';

export type TaskExecutionState =
  | 'Ready'
  | 'Agent runtime not connected'
  | 'Task running'
  | 'Waiting for approval'
  | 'Completed'
  | 'Failed'
  | 'Stopped';

export interface AgentToolExecutionSummary {
  toolName: string;
  statusLabel: string;
  args: Record<string, unknown>;
  executed: boolean;
  toolSuccess: boolean;
  sessionId: string | null;
  pageTitle: string | null;
  currentUrl: string | null;
  summary: string;
  screenshotCaptured: boolean;
  approvalRequired?: boolean;
  pendingOrigin?: string;
  skippedAdditionalTools?: string[];
  error?: {
    code: string;
    message: string;
  };
}

export interface TaskMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  isError?: boolean;
  toolExecution?: AgentToolExecutionSummary | null;
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

export interface ConversationHistoryTurn {
  role: 'user' | 'model';
  content: string;
}

export interface AgentRuntimeStatusResponse {
  configured: boolean;
  model: string;
  statusLabel: string;
  toolDeclarationsCount: number;
  registeredTools: string[];
}

export interface AgentChatRequest {
  message: string;
  history?: ConversationHistoryTurn[];
}

export interface AgentChatResponse {
  success: boolean;
  model: string;
  reply: string | null;
  timestamp: string;
  durationMs: number;
  toolExecution?: AgentToolExecutionSummary | null;
  browserSession?: ManagedBrowserSessionInfo;
  error?: {
    code:
      | 'EMPTY_MESSAGE'
      | 'MESSAGE_TOO_LONG'
      | 'MALFORMED_REQUEST'
      | 'MISSING_API_KEY'
      | 'MODEL_TIMEOUT'
      | 'EMPTY_MODEL_RESPONSE'
      | 'GEMINI_API_ERROR';
    message: string;
  };
}
