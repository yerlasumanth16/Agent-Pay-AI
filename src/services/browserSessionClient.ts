import {
  BrowserHealthCheckResult,
  ManagedBrowserSessionInfo,
} from '../types/browserHealth';
import {
  BrowserActionRequest,
  BrowserActionResponse,
} from '../types/browserActions';
import {
  AgentChatRequest,
  AgentChatResponse,
  AgentRuntimeStatusResponse,
} from '../types/agentpay';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getWorkspaceToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const res = await fetch('/api/browser/session-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AgentPay-Client': 'workspace-v2',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error ||
        `Failed to obtain workspace session token (HTTP ${res.status})`
    );
  }

  const data = (await res.json()) as { token: string; expiresInMs: number };
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + (data.expiresInMs || 1800_000);
  return cachedToken;
}

async function authorizedRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  bodyPayload?: unknown,
  allowStructuredErrorResponse = false
): Promise<T> {
  let token = await getWorkspaceToken(false);

  const makeFetch = (bearer: string) =>
    fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-AgentPay-Client': 'workspace-v2',
        Authorization: `Bearer ${bearer}`,
      },
      body:
        method === 'POST' ? JSON.stringify(bodyPayload ?? {}) : undefined,
    });

  let res = await makeFetch(token);

  if (res.status === 401 || (res.status === 403 && !allowStructuredErrorResponse)) {
    token = await getWorkspaceToken(true);
    res = await makeFetch(token);
  } else if (res.status === 403 && allowStructuredErrorResponse) {
    const clone = res.clone();
    const bodyJson = await clone.json().catch(() => null);
    if (bodyJson && typeof bodyJson.error === 'string' && bodyJson.error.includes('token')) {
      token = await getWorkspaceToken(true);
      res = await makeFetch(token);
    }
  }

  if (!res.ok && !allowStructuredErrorResponse) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData.error || `Request failed (HTTP ${res.status})`
    );
  }

  return (await res.json()) as T;
}

export async function fetchBrowserSessionStatus(): Promise<ManagedBrowserSessionInfo> {
  return authorizedRequest<ManagedBrowserSessionInfo>(
    '/api/browser/session/status',
    'GET'
  );
}

export async function startBrowserSession(): Promise<ManagedBrowserSessionInfo> {
  return authorizedRequest<ManagedBrowserSessionInfo>(
    '/api/browser/session/start',
    'POST'
  );
}

export async function refreshBrowserScreenshot(): Promise<ManagedBrowserSessionInfo> {
  return authorizedRequest<ManagedBrowserSessionInfo>(
    '/api/browser/session/screenshot',
    'POST'
  );
}

export async function closeBrowserSession(): Promise<ManagedBrowserSessionInfo> {
  return authorizedRequest<ManagedBrowserSessionInfo>(
    '/api/browser/session/close',
    'POST'
  );
}

export async function sendBrowserAction(
  payload: BrowserActionRequest
): Promise<BrowserActionResponse> {
  return authorizedRequest<BrowserActionResponse>(
    '/api/browser/session/action',
    'POST',
    payload,
    true
  );
}

export async function fetchAgentRuntimeStatus(): Promise<AgentRuntimeStatusResponse> {
  return authorizedRequest<AgentRuntimeStatusResponse>(
    '/api/agent/status',
    'GET'
  );
}

export async function sendAgentChatMessage(
  payload: AgentChatRequest
): Promise<AgentChatResponse> {
  return authorizedRequest<AgentChatResponse>(
    '/api/agent/chat',
    'POST',
    payload,
    true
  );
}

export async function runBrowserDiagnosticCheck(): Promise<BrowserHealthCheckResult> {
  return authorizedRequest<BrowserHealthCheckResult>(
    '/api/browser/health-check',
    'POST'
  );
}
