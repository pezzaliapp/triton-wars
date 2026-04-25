import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  registerSW({
    immediate: true,
    onNeedRefresh() {
      // intentionally silent in Phase 1; UI prompt arrives in Phase 4
    },
    onOfflineReady() {
      // ditto — kept silent for now
    },
  });
}
