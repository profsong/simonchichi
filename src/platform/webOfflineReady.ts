/** Read existing storage only: registration/update failures must not erase readiness. */
export async function hasSavedWebApp(base = import.meta.env.BASE_URL): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in globalThis)) return false;
  try {
    const scope = new URL(base, location.origin).href;
    const registration = await navigator.serviceWorker.getRegistration(scope);
    if (
      registration?.scope !== scope ||
      registration.active?.state !== 'activated' ||
      registration.active.scriptURL !== new URL('sw.js', scope).href
    )
      return false;

    // Workbox's default precache name includes the registration scope, keeping
    // another Pages app's caches from being mistaken for this installation.
    const cacheName = `workbox-precache-v2-${scope}`;
    if (!(await caches.keys()).includes(cacheName)) return false;
    const cache = await caches.open(cacheName);
    const assets = [
      ...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
        'script[type="module"][src], link[rel="stylesheet"][href], link[rel="modulepreload"][href], link[rel="icon"][href], link[rel="apple-touch-icon"][href], link[rel="manifest"][href]',
      ),
    ].map(
      (element) =>
        new URL(element.getAttribute('src') ?? element.getAttribute('href')!, location.href).href,
    );

    // Both complete course banks are statically imported into the app entry
    // bundle. Verify that exact loaded bundle and CSS, not merely an active SW.
    if (!assets.some((url) => new URL(url).pathname.endsWith('.js'))) return false;
    if (!assets.some((url) => new URL(url).pathname.endsWith('.css'))) return false;
    const required = [new URL('index.html', scope).href, ...assets];
    if (required.some((url) => !url.startsWith(scope))) return false;
    const responses = await Promise.all(
      required.map((url) => cache.match(url, { ignoreSearch: true })),
    );
    return responses.every((response) => response?.ok === true);
  } catch {
    // Storage restrictions or eviction should leave the status unconfirmed.
    return false;
  }
}
