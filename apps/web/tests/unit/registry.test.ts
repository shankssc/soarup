// apps/web/tests/unit/registry.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribe, dispatch, clearAllHandlers } from '@/lib/websocket/registry';

beforeEach(() => {
  clearAllHandlers();
});

describe('registry — subscribe', () => {
  it('registers a handler for an event type', () => {
    const handler = vi.fn();
    subscribe('update.status_changed', handler);
    dispatch({ type: 'update.status_changed', payload: { status: 'processed' } });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ status: 'processed' });
  });

  it('returns an unsubscribe function', () => {
    const handler = vi.fn();
    const unsubscribe = subscribe('update.status_changed', handler);
    unsubscribe();
    dispatch({ type: 'update.status_changed', payload: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it('same handler can subscribe to multiple event types', () => {
    const handler = vi.fn();
    subscribe('update.status_changed', handler);
    subscribe('audio.transcription_complete', handler);
    dispatch({ type: 'update.status_changed', payload: { a: 1 } });
    dispatch({ type: 'audio.transcription_complete', payload: { b: 2 } });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(handler).toHaveBeenNthCalledWith(2, { b: 2 });
  });
});

describe('registry — dispatch', () => {
  it('calls all handlers registered for the same event type', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    subscribe('update.status_changed', handlerA);
    subscribe('update.status_changed', handlerB);
    dispatch({ type: 'update.status_changed', payload: { status: 'processed' } });
    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerB).toHaveBeenCalledOnce();
    expect(handlerA).toHaveBeenCalledWith({ status: 'processed' });
    expect(handlerB).toHaveBeenCalledWith({ status: 'processed' });
  });

  it('does not call handlers registered for other event types', () => {
    const handler = vi.fn();
    subscribe('update.status_changed', handler);
    dispatch({ type: 'audio.transcription_complete', payload: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does nothing when no handlers are registered for the type', () => {
    expect(() =>
      dispatch({ type: 'update.status_changed', payload: {} }),
    ).not.toThrow();
  });
});

describe('registry — unsubscribe', () => {
  it('removing one handler does not affect others for the same type', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const unsubscribeA = subscribe('update.status_changed', handlerA);
    subscribe('update.status_changed', handlerB);
    unsubscribeA();
    dispatch({ type: 'update.status_changed', payload: { status: 'processed' } });
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledOnce();
  });
});

describe('registry — clearAllHandlers', () => {
  it('removes all subscriptions across all event types', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    subscribe('update.status_changed', handlerA);
    subscribe('audio.transcription_complete', handlerB);
    clearAllHandlers();
    dispatch({ type: 'update.status_changed', payload: {} });
    dispatch({ type: 'audio.transcription_complete', payload: {} });
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });
});
