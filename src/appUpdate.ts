import { useSyncExternalStore } from 'react';

/**
 * Keeps open pages on the latest deploy.
 *
 * The site is a PWA: a service worker serves the stored app so it also works
 * offline on the Dell hotspot. The flip side is that a phone keeps showing the
 * stored (old) version until the service worker updates, and a page that stays
 * open never notices a new deploy at all.
 *
 * - While a page is open it checks for a new deploy every minute (when the tab
 *   is visible), when the tab comes back into view and when the connection
 *   returns.
 * - The new service worker takes over by itself (skipWaiting + clientsClaim).
 *   Public pages then reload straight away. Staff pages (scorekeeper, admin)
 *   only flag the update, so nobody loses points or a half-typed result:
 *   they show a "new version" bar with a Reload button.
 */

const UPDATE_CHECK_MS = 60_000;
const STAFF_PATHS = ['/staff', '/score', '/admin'];

let updateReady = false;
const listeners = new Set<() => void>();

function isStaffPage(): boolean {
  const path = window.location.pathname.toLowerCase();
  return STAFF_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function registerServiceWorker() {
  // Production builds only: the dev server has no service worker.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // No controller on load means a first visit: the service worker taking
  // control then replaces nothing, so there is nothing to reload.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (isStaffPage()) {
      updateReady = true;
      listeners.forEach((listener) => listener());
    } else {
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        const check = () => {
          if (document.visibilityState !== 'visible' || !navigator.onLine) return;
          registration.update().catch(() => undefined);
        };
        window.setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);
      })
      .catch(() => undefined);
  });
}

/** True once a new deploy has taken over a staff page that still runs the old code. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => updateReady
  );
}
