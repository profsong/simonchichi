import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppMode } from '../core/types';
import { isNativeApp, loadAppMode, saveAppMode, webAppMode } from './runtime';
import { loadWebServiceWorker } from './webServiceWorker';
import { hasSavedWebApp } from './webOfflineReady';

export function useAppRuntime(demoEnabled: boolean) {
  const [native] = useState(isNativeApp);
  const [mode, setMode] = useState<AppMode>(() => (native ? 'learner' : webAppMode(demoEnabled)));
  const [modeReady, setModeReady] = useState(!native);
  const [startupError, setStartupError] = useState('');
  const [offlineReady, setOfflineReady] = useState(native);
  const [needRefresh, setNeedRefresh] = useState(false);
  const update = useRef<(reloadPage?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!native) return;
    let active = true;
    void loadAppMode(demoEnabled)
      .then((value) => {
        if (!active) return;
        setMode(value);
        setModeReady(true);
      })
      .catch(() => {
        if (active) setStartupError('앱 설정을 읽지 못했어요. 앱을 다시 열어 주세요.');
      });
    return () => {
      active = false;
    };
  }, [demoEnabled, native]);

  useEffect(() => {
    // Android loads its entire app and content bank from the installed package.
    // No service worker is imported or registered in the native runtime.
    if (native) return;
    let active = true;
    let readinessCheck = 0;
    const restoreOfflineReady = () => {
      const check = ++readinessCheck;
      void hasSavedWebApp().then((ready) => {
        if (active && check === readinessCheck) setOfflineReady(ready);
      });
    };
    // An already installed worker does not emit the plugin's installed event
    // again. Check its saved app even if today's registration/update is a 404.
    restoreOfflineReady();
    navigator.serviceWorker?.addEventListener('controllerchange', restoreOfflineReady);
    void loadWebServiceWorker()
      .then(({ registerSW }) => {
        if (!active) return;
        update.current = registerSW({
          immediate: true,
          onOfflineReady: () => {
            // Installation is newer evidence than any still-pending cache read.
            readinessCheck++;
            if (active) setOfflineReady(true);
          },
          onNeedRefresh: () => {
            if (active) setNeedRefresh(true);
          },
          onRegisteredSW: restoreOfflineReady,
        });
      })
      .catch(() => {
        // Online use remains available if this browser cannot register a worker.
      });
    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener('controllerchange', restoreOfflineReady);
      update.current = async () => {};
    };
  }, [native]);

  const changeMode = useCallback(
    async (next: AppMode) => {
      const savedMode = await saveAppMode(next, demoEnabled);
      setMode(savedMode);
    },
    [demoEnabled],
  );
  const updateServiceWorker = useCallback(async (reloadPage = true) => {
    await update.current(reloadPage);
  }, []);

  return {
    native,
    mode,
    modeReady,
    startupError,
    changeMode,
    offlineReady,
    needRefresh,
    updateServiceWorker,
  };
}
