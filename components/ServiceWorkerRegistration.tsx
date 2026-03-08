"use client";

import { useEffect } from "react";

/**
 * Registers the Service Worker and listens for update notifications.
 * Replaces the inline <script> to comply with strict CSP (no unsafe-inline).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});

      // Listen for SW update notifications
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "SW_UPDATED") {
          // Could show a toast here — for now just log
          console.log("[GoldChain] New version available. Refresh to update.");
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, []);

  return null;
}
