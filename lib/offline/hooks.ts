// ============================================================
// THE GOLDCHAIN — Offline React Hooks
// Provides online/offline status and offline declaration queue
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { getAllDeclarations, getPendingCount, type PendingDeclaration } from "./db";
import { enqueueDeclaration, drainQueue, type SyncResult } from "./queue";
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
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const all = await getAllDeclarations();
      setPendingDeclarations(all);
    } catch {
      // IndexedDB not available
    }
  }, []);

  // Load queue on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Auto-sync when coming back online
  useEffect(() => {
    async function handleOnline() {
      await syncNow();
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Submit a declaration — online: server action, offline: queue.
   * Returns { queued: true, localId } if offline.
   */
  const submit = useCallback(async (
    input: {
      declared_weight_kg: number;
      gps_lat: number | null;
      gps_lng: number | null;
      field_notes: string | null;
    }
  ): Promise<{ queued: true; localId: number }> => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Not authenticated — cannot queue declaration");
    }

    const localId = await enqueueDeclaration(input, session.access_token);
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
      setSyncStatus(result.failed > 0 ? "error" : "done");
      await refreshQueue();

      // Reset status after 5 seconds
      setTimeout(() => setSyncStatus("idle"), 5000);
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
