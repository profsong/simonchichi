import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSavedWebApp } from '../../src/platform/webOfflineReady';

function savedApp(base = '/') {
  const scope = new URL(base, location.origin).href;
  const cacheName = `workbox-precache-v2-${scope}`;
  const urls = ['index.html', 'assets/app-abc.js', 'assets/app-def.css', 'icons/icon.svg'];
  const entries = new Map(urls.map((path) => [new URL(path, scope).href, new Response('saved')]));
  document.head.innerHTML = `
    <script type="module" src="${base}assets/app-abc.js"></script>
    <link rel="stylesheet" href="${base}assets/app-def.css">
    <link rel="icon" href="${base}icons/icon.svg">
  `;
  const registration = {
    scope,
    active: { state: 'activated', scriptURL: `${scope}sw.js` },
  };
  const getRegistration = vi.fn(async () => registration);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration },
  });
  const match = vi.fn(async (url: string, options: CacheQueryOptions) => {
    expect(options.ignoreSearch).toBe(true);
    return entries.get(url);
  });
  const open = vi.fn(async () => ({ match }));
  const keys = vi.fn(async () => [cacheName]);
  vi.stubGlobal('caches', { keys, open });
  const fetch = vi.fn(() => {
    throw new Error('Readiness must not make network requests');
  });
  vi.stubGlobal('fetch', fetch);
  return { scope, entries, registration, getRegistration, keys, open, fetch };
}

afterEach(() => {
  document.head.innerHTML = '';
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.unstubAllGlobals();
});

describe('saved web app readiness', () => {
  it.each(['/', '/simonchichi/'])(
    'checks an existing app in %s without network access',
    async (base) => {
      const saved = savedApp(base);
      await expect(hasSavedWebApp(base)).resolves.toBe(true);
      expect(saved.getRegistration).toHaveBeenCalledWith(saved.scope);
      expect(saved.open).toHaveBeenCalledWith(`workbox-precache-v2-${saved.scope}`);
      expect(saved.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['index.html', 'assets/app-abc.js', 'assets/app-def.css'])(
    'rejects a missing cached %s',
    async (path) => {
      const saved = savedApp();
      saved.entries.delete(new URL(path, saved.scope).href);
      await expect(hasSavedWebApp()).resolves.toBe(false);
    },
  );

  it('does not accept a neighboring Pages app worker or cache', async () => {
    const saved = savedApp('/simonchichi/');
    saved.registration.scope = `${location.origin}/another-app/`;
    await expect(hasSavedWebApp('/simonchichi/')).resolves.toBe(false);
    saved.registration.scope = saved.scope;
    saved.keys.mockResolvedValue([`workbox-precache-v2-${location.origin}/another-app/`]);
    await expect(hasSavedWebApp('/simonchichi/')).resolves.toBe(false);
    expect(saved.open).not.toHaveBeenCalled();
  });

  it('does not mistake a cached older course bundle for the loaded entry bundle', async () => {
    const saved = savedApp('/simonchichi/');
    saved.entries.delete(`${saved.scope}assets/app-abc.js`);
    saved.entries.set(`${saved.scope}assets/app-previous.js`, new Response('older bank'));
    await expect(hasSavedWebApp('/simonchichi/')).resolves.toBe(false);
  });

  it('returns unconfirmed when the browser does not support service workers or CacheStorage', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    await expect(hasSavedWebApp()).resolves.toBe(false);
    savedApp();
    vi.stubGlobal('caches', undefined);
    await expect(hasSavedWebApp()).resolves.toBe(false);
  });

  it('does not accept an installing worker or a failed cache response', async () => {
    const saved = savedApp();
    saved.registration.active.state = 'installing';
    await expect(hasSavedWebApp()).resolves.toBe(false);
    saved.registration.active.state = 'activated';
    saved.entries.set(
      `${saved.scope}assets/app-abc.js`,
      new Response('Not found', { status: 404 }),
    );
    await expect(hasSavedWebApp()).resolves.toBe(false);
  });

  it('keeps readiness unconfirmed when browser storage access fails', async () => {
    const saved = savedApp();
    saved.keys.mockRejectedValue(new Error('storage unavailable'));
    await expect(hasSavedWebApp()).resolves.toBe(false);
  });
});
