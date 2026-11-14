import { registerSW } from 'virtual:pwa-register';

/**
 * Offline support. The service worker caches the app, fonts and word list; when a newer
 * version has been downloaded it waits, and the app offers "update available · reload"
 * instead of swapping code under a round in progress.
 */
let notify: (() => void) | null = null, waiting = false;
const apply = registerSW({ onNeedRefresh() { waiting = true; notify?.(); } });

export function onUpdateReady(cb: () => void) { notify = cb; if (waiting) cb(); }
export const applyUpdate = () => apply(true);
