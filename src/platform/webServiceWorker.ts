/** Kept behind a loader so the native runtime never imports the PWA registration module. */
export function loadWebServiceWorker() {
  return import('virtual:pwa-register');
}
