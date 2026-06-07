// apps/web/tests/unit/useWebSocket.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebSocketStore } from '@/stores/websocket-store';
import { useAuthStore } from '@/hooks/useAuth';
import * as registry from '@/lib/websocket/registry';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'workspace-123';

// ─── Fake WebSocket ───────────────────────────────────────────────────────────

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0; // CONNECTING STATE
  close = vi.fn(() => {
    this.readyState = 3; // CLOSED
    this.onclose?.({ code: 1000, reason: '' });
  });

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  triggerOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  triggerClose(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  triggerMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  triggerError() {
    this.onerror?.();
    // onerror calls ws.close() in the hook which triggers onclose via close mock
  }
}

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryWrapper';
  return { wrapper: Wrapper, queryClient };
}

// ─── Default hook options ─────────────────────────────────────────────────────

const defaultOptions = {
  workspaceId: MOCK_WORKSPACE_ID,
  accessToken: 'mock-access-token',
  enabled: true,
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  useWebSocketStore.setState({
    status: 'idle',
    reconnectAttempts: 0,
    lastEventId: null,
  });
  useAuthStore.setState({
    user: MOCK_USER,
    tokens: MOCK_TOKENS,
    isLoading: false,
    error: null,
  });
  vi.spyOn(registry, 'dispatch');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useWebSocketStore.setState({
    status: 'idle',
    reconnectAttempts: 0,
    lastEventId: null,
  });
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
});

// ─── Connection lifecycle ─────────────────────────────────────────────────────

describe('useWebSocket — connection lifecycle', () => {
  it('sets status to connecting on mount', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    expect(useWebSocketStore.getState().status).toBe('connecting');
  });

  it('sets status to connected after onopen fires', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });
    expect(useWebSocketStore.getState().status).toBe('connected');
  });

  it('resets reconnectAttempts to 0 on open', () => {
    const { wrapper } = createWrapper();
    useWebSocketStore.setState({ reconnectAttempts: 3 });
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });
    expect(useWebSocketStore.getState().reconnectAttempts).toBe(0);
  });

  it('constructs WebSocket URL with workspaceId and token', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toContain(MOCK_WORKSPACE_ID);
    expect(ws.url).toContain('mock-access-token');
  });

  it('does not connect when enabled is false', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket({ ...defaultOptions, enabled: false }), { wrapper });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(useWebSocketStore.getState().status).toBe('idle');
  });

  it('does not connect when workspaceId is undefined', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket({ ...defaultOptions, workspaceId: undefined }), {
      wrapper,
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('does not connect when accessToken is undefined', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket({ ...defaultOptions, accessToken: undefined }), {
      wrapper,
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

// ─── Unmount cleanup ──────────────────────────────────────────────────────────

describe('useWebSocket — unmount', () => {
  it('closes WebSocket and resets status on unmount', () => {
    const { wrapper } = createWrapper();
    const { unmount } = renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });
    expect(useWebSocketStore.getState().status).toBe('connected');

    unmount();

    expect(useWebSocketStore.getState().status).toBe('idle');
  });
});

// ─── Message handling ─────────────────────────────────────────────────────────

describe('useWebSocket — message handling', () => {
  it('dispatches parsed messages to the registry', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });

    const message = {
      type: 'update.status_changed',
      event_id: 'evt-001',
      payload: { status: 'processed' },
    };
    act(() => {
      ws.triggerMessage(message);
    });

    expect(registry.dispatch).toHaveBeenCalledWith(message);
  });

  it('stores lastEventId from incoming message', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });
    act(() => {
      ws.triggerMessage({
        type: 'update.status_changed',
        event_id: 'evt-xyz',
        payload: {},
      });
    });
    expect(useWebSocketStore.getState().lastEventId).toBe('evt-xyz');
  });

  it('handles invalid JSON gracefully without throwing', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });

    expect(() => {
      act(() => {
        ws.onmessage?.({ data: 'not-json' });
      });
    }).not.toThrow();

    expect(registry.dispatch).not.toHaveBeenCalled();
  });
});

// ─── Close / reconnect ────────────────────────────────────────────────────────

describe('useWebSocket — close and error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets status to error on 4001 close and does not reconnect', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerClose(4001);
    });
    expect(useWebSocketStore.getState().status).toBe('error');
    act(() => {
      vi.advanceTimersByTime(35_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('sets status to disconnected after max reconnect attempts', () => {
    useWebSocketStore.setState({ reconnectAttempts: 10 });
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerClose(1006);
    });
    expect(useWebSocketStore.getState().status).toBe('disconnected');
  });

  it('onerror closes the WebSocket', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWebSocket(defaultOptions), { wrapper });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.triggerError();
    });
    expect(ws.close).toHaveBeenCalled();
  });
});
