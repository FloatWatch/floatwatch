"use client";

import { useEffect } from "react";

const SW_CLEANUP_DONE_KEY = "floatwatch-sw-cleanup-done";

function isSessionStorageUsable() {
  try {
    if (typeof window === "undefined" || !("sessionStorage" in window)) {
      return false;
    }
    const testKey = "__floatwatch_sw_cleanup_test__";
    window.sessionStorage.setItem(testKey, "1");
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function ClearStaleServiceWorker() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      return;
    }

    const cleanup = async () => {
      try {
        const canUseSessionStorage = isSessionStorageUsable();
        if (canUseSessionStorage) {
          const done = window.sessionStorage.getItem(SW_CLEANUP_DONE_KEY);
          if (done === "1") {
            return;
          }
        }

        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          await Promise.all(registrations.map((registration) => registration.unregister().catch(() => {})));
        }

        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }

        if (canUseSessionStorage) {
          window.sessionStorage.setItem(SW_CLEANUP_DONE_KEY, "1");
        }
      } catch {
        // Ignore cleanup errors and keep the app rendering.
      }
    };

    void cleanup();
  }, []);

  return null;
}
