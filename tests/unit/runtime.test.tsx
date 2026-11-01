import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  native: false,
  preference: null as string | null,
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
  registerPlugin: vi.fn(),
  loadWorker: vi.fn(),
  registerWorker: vi.fn(),
  updateWorker: vi.fn(),
  savedWebApp: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
  registerPlugin: bridge.registerPlugin,
}));
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: bridge.get, set: bridge.set } }));
vi.mock('../../src/platform/webServiceWorker', () => ({ loadWebServiceWorker: bridge.loadWorker }));
vi.mock('../../src/platform/webOfflineReady', () => ({ hasSavedWebApp: bridge.savedWebApp }));

import { loadAppMode, saveAppMode, saveNativeBackup, webAppMode } from '../../src/platform/runtime';
import { useAppRuntime } from '../../src/platform/useAppRuntime';

beforeEach(() => {
  vi.clearAllMocks();
  bridge.native = false;
  bridge.preference = null;
  bridge.get.mockImplementation(async () => ({ value: bridge.preference }));
  bridge.set.mockImplementation(async ({ value }: { value: string }) => {
    bridge.preference = value;
  });
  bridge.save.mockResolvedValue({});
  bridge.registerPlugin.mockReturnValue({ save: bridge.save });
  bridge.updateWorker.mockResolvedValue(undefined);
  bridge.registerWorker.mockReturnValue(bridge.updateWorker);
  bridge.loadWorker.mockResolvedValue({ registerSW: bridge.registerWorker });
  bridge.savedWebApp.mockResolvedValue(false);
  history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('platform mode and native backup bridge', () => {
  it('preserves web URL opt-in behavior and never writes native preferences on web', async () => {
    expect(webAppMode(true, '?demo=1')).toBe('demo');
    expect(webAppMode(false, '?demo=1')).toBe('learner');
    history.replaceState(null, '', '/?view=settings#content');
    await expect(saveAppMode('demo', true)).resolves.toBe('demo');
    expect(location.search).toBe('?view=settings&demo=1');
    expect(location.hash).toBe('#content');
    await expect(loadAppMode(true)).resolves.toBe('demo');
    await saveAppMode('learner', true);
    expect(location.search).toBe('?view=settings');
    expect(bridge.get).not.toHaveBeenCalled();
    expect(bridge.set).not.toHaveBeenCalled();
  });

  it('requires explicit native opt-in and restores that preference after launch', async () => {
    bridge.native = true;
    history.replaceState(null, '', '/?demo=1');
    await expect(loadAppMode(true)).resolves.toBe('learner');
    await saveAppMode('demo', true);
    history.replaceState(null, '', '/');
    await expect(loadAppMode(true)).resolves.toBe('demo');
    expect(bridge.set).toHaveBeenCalledWith({ key: 'simonchichi.content-mode', value: 'demo' });
    await expect(loadAppMode(false)).resolves.toBe('learner');
    await expect(saveAppMode('demo', false)).resolves.toBe('learner');
  });

  it('opens native Save As only on native and treats picker cancellation as a result', async () => {
    await expect(saveNativeBackup('backup.json', '{}')).rejects.toThrow();
    expect(bridge.registerPlugin).not.toHaveBeenCalled();
    bridge.native = true;
    bridge.save.mockResolvedValueOnce({ cancelled: true });
    await expect(
      saveNativeBackup('시몬치치-demo-2026-10-23.json', '{"schemaVersion":1}'),
    ).resolves.toEqual({ cancelled: true });
    expect(bridge.registerPlugin).toHaveBeenCalledWith('BackupFiles');
    expect(bridge.save).toHaveBeenCalledWith({
      filename: '시몬치치-demo-2026-10-23.json',
      json: '{"schemaVersion":1}',
    });
  });

  it('retries a missing native read callback and restores the saved mode', async () => {
    vi.useFakeTimers();
    bridge.native = true;
    bridge.get
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ value: 'demo' });
    const pending = loadAppMode(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(bridge.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('demo');
    expect(bridge.get).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(bridge.set).not.toHaveBeenCalled();
  });

  it('rejects after three missing callbacks without silently choosing learner mode', async () => {
    vi.useFakeTimers();
    bridge.native = true;
    bridge.get.mockImplementation(() => new Promise(() => {}));
    const pending = loadAppMode(true);
    // Attach the rejection assertion before advancing the timer to avoid an unhandled rejection.
    const failure = expect(pending).rejects.toThrow('응답을 기다리는 시간');
    await vi.advanceTimersByTimeAsync(5999);
    expect(bridge.get).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(bridge.get).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry explicit native storage errors and clears the read timer', async () => {
    vi.useFakeTimers();
    bridge.native = true;
    bridge.get.mockRejectedValueOnce(new Error('storage denied'));
    await expect(loadAppMode(true)).rejects.toThrow('storage denied');
    await vi.advanceTimersByTimeAsync(6000);
    expect(bridge.get).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('runtime hook', () => {
  it.each(['resolve', 'reject'] as const)(
    'ignores a late first callback (%s) after a retry restores demo',
    async (outcome) => {
      vi.useFakeTimers();
      bridge.native = true;
      let resolveFirst!: (result: { value: string | null }) => void;
      let rejectFirst!: (error: Error) => void;
      bridge.get
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveFirst = resolve;
              rejectFirst = reject;
            }),
        )
        .mockResolvedValueOnce({ value: 'demo' });
      const { result } = renderHook(() => useAppRuntime(true));
      expect(result.current.modeReady).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(result.current.modeReady).toBe(true);
      expect(result.current.mode).toBe('demo');
      await act(async () => {
        if (outcome === 'resolve') resolveFirst({ value: 'learner' });
        else rejectFirst(new Error('late failure'));
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(result.current.mode).toBe('demo');
      expect(result.current.startupError).toBe('');
      expect(bridge.get).toHaveBeenCalledTimes(2);
      expect(bridge.loadWorker).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('shows the existing startup error after bounded native read attempts', async () => {
    vi.useFakeTimers();
    bridge.native = true;
    bridge.get.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAppRuntime(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(result.current.startupError).toContain('앱 설정을 읽지 못했어요');
    expect(result.current.modeReady).toBe(false);
    expect(bridge.get).toHaveBeenCalledTimes(3);
    expect(bridge.loadWorker).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for native preferences, restores demo, and never loads a service worker', async () => {
    bridge.native = true;
    bridge.preference = 'demo';
    const { result, unmount } = renderHook(() => useAppRuntime(true));
    expect(result.current.modeReady).toBe(false);
    expect(result.current.offlineReady).toBe(true);
    await waitFor(() => expect(result.current.modeReady).toBe(true));
    expect(result.current.mode).toBe('demo');
    expect(bridge.loadWorker).not.toHaveBeenCalled();
    expect(bridge.savedWebApp).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.changeMode('learner');
    });
    expect(result.current.mode).toBe('learner');
    unmount();
    const nextLaunch = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(nextLaunch.result.current.modeReady).toBe(true));
    expect(nextLaunch.result.current.mode).toBe('learner');
    expect(bridge.loadWorker).not.toHaveBeenCalled();
  });

  it('retains web offline/update callbacks', async () => {
    const { result } = renderHook(() => useAppRuntime(true));
    expect(result.current.modeReady).toBe(true);
    expect(result.current.offlineReady).toBe(false);
    await waitFor(() => expect(bridge.registerWorker).toHaveBeenCalledTimes(1));
    const options = bridge.registerWorker.mock.calls[0][0] as {
      onOfflineReady: () => void;
      onNeedRefresh: () => void;
    };
    act(() => {
      options.onOfflineReady();
      options.onNeedRefresh();
    });
    expect(result.current.offlineReady).toBe(true);
    expect(result.current.needRefresh).toBe(true);
    await act(async () => {
      await result.current.updateServiceWorker(true);
    });
    expect(bridge.updateWorker).toHaveBeenCalledWith(true);
    expect(bridge.get).not.toHaveBeenCalled();
  });

  it('restores saved web readiness without an install event or successful registration', async () => {
    bridge.savedWebApp.mockResolvedValue(true);
    bridge.loadWorker.mockRejectedValueOnce(new Error('host is no longer available'));
    const { result } = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(result.current.offlineReady).toBe(true));
    expect(result.current.startupError).toBe('');
    expect(bridge.registerWorker).not.toHaveBeenCalled();
  });

  it('does not treat registration alone as proof that app files are cached', async () => {
    const { result } = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(bridge.registerWorker).toHaveBeenCalledTimes(1));
    const options = bridge.registerWorker.mock.calls[0][0] as { onRegisteredSW: () => void };
    await act(async () => options.onRegisteredSW());
    expect(bridge.savedWebApp).toHaveBeenCalledTimes(2);
    expect(result.current.offlineReady).toBe(false);
  });

  it('does not let a delayed pre-install cache read overwrite installation readiness', async () => {
    let finishInitialRead!: (ready: boolean) => void;
    bridge.savedWebApp.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishInitialRead = resolve;
        }),
    );
    const { result } = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(bridge.registerWorker).toHaveBeenCalledTimes(1));
    const options = bridge.registerWorker.mock.calls[0][0] as { onOfflineReady: () => void };
    act(() => options.onOfflineReady());
    expect(result.current.offlineReady).toBe(true);
    await act(async () => finishInitialRead(false));
    expect(result.current.offlineReady).toBe(true);
  });

  it('uses the latest cache probe when older reads finish out of order', async () => {
    let finishInitialRead!: (ready: boolean) => void;
    let finishRegisteredRead!: (ready: boolean) => void;
    bridge.savedWebApp
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finishInitialRead = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finishRegisteredRead = resolve;
          }),
      );
    const { result } = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(bridge.registerWorker).toHaveBeenCalledTimes(1));
    const options = bridge.registerWorker.mock.calls[0][0] as { onRegisteredSW: () => void };
    act(() => options.onRegisteredSW());
    await act(async () => finishRegisteredRead(false));
    await act(async () => finishInitialRead(true));
    expect(result.current.offlineReady).toBe(false);
    expect(bridge.savedWebApp).toHaveBeenCalledTimes(2);
  });

  it('rechecks actual saved files when the controller changes and removes its listener', async () => {
    const serviceWorker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
    try {
      const { result, unmount } = renderHook(() => useAppRuntime(true));
      await waitFor(() => expect(bridge.registerWorker).toHaveBeenCalledTimes(1));
      expect(result.current.offlineReady).toBe(false);
      bridge.savedWebApp.mockResolvedValue(true);
      await act(async () => serviceWorker.dispatchEvent(new Event('controllerchange')));
      expect(result.current.offlineReady).toBe(true);
      bridge.savedWebApp.mockResolvedValue(false);
      await act(async () => serviceWorker.dispatchEvent(new Event('controllerchange')));
      expect(result.current.offlineReady).toBe(false);
      expect(bridge.savedWebApp).toHaveBeenCalledTimes(3);
      unmount();
      serviceWorker.dispatchEvent(new Event('controllerchange'));
      expect(bridge.savedWebApp).toHaveBeenCalledTimes(3);
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('does not show another mode if native preferences cannot be read', async () => {
    bridge.native = true;
    bridge.get.mockRejectedValueOnce(new Error('preference store unavailable'));
    const { result } = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(result.current.startupError).not.toBe(''));
    expect(result.current.modeReady).toBe(false);
    expect(bridge.loadWorker).not.toHaveBeenCalled();
  });

  it('keeps the current native mode when persistence fails', async () => {
    bridge.native = true;
    const { result } = renderHook(() => useAppRuntime(true));
    await waitFor(() => expect(result.current.modeReady).toBe(true));
    bridge.set.mockRejectedValueOnce(new Error('preference write unavailable'));
    await act(async () => {
      await expect(result.current.changeMode('demo')).rejects.toThrow();
    });
    expect(result.current.mode).toBe('learner');
  });
});
