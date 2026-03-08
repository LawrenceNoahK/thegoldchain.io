// ============================================================
// THE GOLDCHAIN — Offline React Hooks
// Provides online/offline status and offline declaration queue
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { getAllDeclarations, getPendingCount, type PendingDeclaration } from "./db";
import { enqueueDeclaration, drainQueue, type SyncResult } from "./queue";
import { fetchHmacSecret, hasHmacSecret } from "./hmac";
import { createClient } from "@/lib/supabase/client";

/**
 * Track online/offline status with pending declaration count.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Poll pending count every 5 seconds
    const refreshCount = () => getPendingCount().then(setPendingCount).catch(() => {});
    refreshCount();
    const interval = setInterval(refreshCount, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingCount };
}

/**
 * Manages offline declaration queue with auto-sync on reconnect.
 */
export function useOfflineDeclaration() {
  const [pendingDeclarations, setPendingDeclarations] = useState<PendingDeclaration[]>([]);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error" | "token_expired">("idle");
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const all = await getAllDeclarations();
      setPendingDeclarations(all);
    } catch {
      // IndexedDB not available
    }
  }, []);

  // Pre-fetch HMAC secret while online (cached in memory only)
  useEffect(() => {
    async function prefetchSecret() {
      if (!hasHmacSecret()) {
        try {
          const supabase = createClient();
          await fetchHmacSecret(supabase);
        } catch {
          // Will retry when user tries to submit
        }
      }
    }
    prefetchSecret();
  }, []);

  // Load queue on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Auto-sync when coming back online
  useEffect(() => {
    async function handleOnline() {
      // Re-fetch HMAC secret in case it expired
      try {
        const supabase = createClient();
        await fetchHmacSecret(supabase);
      } catch {
        // Will fail gracefully in sync
      }
      await syncNow();
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Submit a declaration to the offline queue.
   * HMAC secret must be available (pre-fetched while online).
   */
  const submit = useCallback(async (
    input: {
      declared_weight_kg: number;
      gps_lat: number | null;
      gps_lng: number | null;
      field_notes: string | null;
    }
  ): Promise<{ queued: true; localId: number }> => {
    // Get HMAC secret (from memory cache or fetch fresh)
    let secret: string;
    try {
      const supabase = createClient();
      secret = await fetchHmacSecret(supabase);
    } catch {
      throw new Error("Cannot queue declaration — HMAC secret unavailable. Were you online when you logged in?");
    }

    const localId = await enqueueDeclaration(input, secret);
    await refreshQueue();
    return { queued: true, localId };
  }, [refreshQueue]);

  /**
   * Manually trigger queue sync.
   */
  const syncNow = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const result = await drainQueue();
      setLastSyncResult(result);

      if (result.tokenExpired) {
        setSyncStatus("token_expired");
        // Don't auto-reset — user needs to see re-login prompt
      } else if (result.failed > 0) {
        setSyncStatus("error");
        setTimeout(() => setSyncStatus("idle"), 5000);
      } else {
        setSyncStatus("done");
        setTimeout(() => setSyncStatus("idle"), 5000);
      }
      await refreshQueue();
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 5000);
    }
  }, [refreshQueue]);

  return {
    submit,
    syncNow,
    pendingDeclarations,
    syncStatus,
    lastSyncResult,
    refreshQueue,
  };
}
