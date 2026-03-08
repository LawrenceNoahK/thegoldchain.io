// ============================================================
// THE GOLDCHAIN — Offline Declaration Queue
// Manages enqueue, sync, and retry for offline declarations
//
// SECURITY:
// - Auth tokens are NEVER stored in IndexedDB
// - HMAC secret is cached in memory only (not IndexedDB)
// - Fresh session token is retrieved at sync time
// - Idempotency keys prevent double-submission
// ============================================================

import {
  addPendingDeclaration,
  getPendingDeclarations,
  updateDeclarationStatus,
  deleteDeclaration,
  type PendingDeclaration,
} from "./db";
import { signPayload, hasHmacSecret, fetchHmacSecret } from "./hmac";
import { createClient } from "@/lib/supabase/client";

const MAX_RETRY = 5;
const SYNC_ENDPOINT = "/api/sync";
const SYNC_TIMEOUT_MS = 15000; // 15 second timeout for 3G networks

// Sync lock to prevent concurrent drainQueue calls
let syncInProgress = false;

/**
 * Generate an idempotency key from the declaration payload.
 * Uses SHA-256 of the serialized payload to detect duplicates.
 */
async function generateIdempotencyKey(
  payload: Record<string, unknown>
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Enqueue a declaration for offline sync.
 * Re-captures GPS at submission time and signs with HMAC.
 */
export async function enqueueDeclaration(
  input: {
    declared_weight_kg: number;
    gps_lat: number | null;
    gps_lng: number | null;
    field_notes: string | null;
  },
  hmacSecret: string
): Promise<number> {
  // Re-capture GPS at the moment of queuing (not from form state)
  let freshLat = input.gps_lat;
  let freshLng = input.gps_lng;

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 0,
          });
        }
      );
      freshLat = parseFloat(position.coords.latitude.toFixed(6));
      freshLng = parseFloat(position.coords.longitude.toFixed(6));
    } catch {
      // GPS unavailable — use form values
    }
  }

  const payload = {
    declared_weight_kg: input.declared_weight_kg,
    gps_lat: freshLat,
    gps_lng: freshLng,
    field_notes: input.field_notes,
    captured_at: new Date().toISOString(),
  };

  // HMAC sign the payload using server-issued secret (NOT stored in IndexedDB)
  const hmac = await signPayload(payload as Record<string, unknown>, hmacSecret);

  // Generate idempotency key to prevent double-submission
  const idempotencyKey = await generateIdempotencyKey(payload as Record<string, unknown>);

  const id = await addPendingDeclaration({
    payload,
    hmac,
    idempotencyKey,
    status: "pending",
    retryCount: 0,
    createdAt: new Date().toISOString(),
  });

  // Try to register Background Sync if available
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("goldchain-declarations");
    } catch {
      // Background Sync not available — will use polling
    }
  }

  return id;
}

export type SyncResult = {
  total: number;
  synced: number;
  failed: number;
  errors: Array<{ id: number; error: string }>;
  tokenExpired: boolean;
};

/**
 * Drain the offline queue by sending pending declarations to the server.
 * Gets a FRESH auth token at sync time (never stored in IndexedDB).
 */
export async function drainQueue(): Promise<SyncResult> {
  // Prevent concurrent sync
  if (syncInProgress) {
    return { total: 0, synced: 0, failed: 0, errors: [], tokenExpired: false };
  }

  syncInProgress = true;
  try {
    return await drainQueueInternal();
  } finally {
    syncInProgress = false;
  }
}

async function drainQueueInternal(): Promise<SyncResult> {
  const pending = await getPendingDeclarations();
  const result: SyncResult = { total: pending.length, synced: 0, failed: 0, errors: [], tokenExpired: false };

  if (pending.length === 0) return result;

  // Get fresh auth token from current session
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    // Token expired — notify caller to prompt re-auth
    result.tokenExpired = true;
    result.failed = pending.length;
    for (const d of pending) {
      result.errors.push({ id: d.id!, error: "Session expired — please log in again" });
    }
    return result;
  }

  for (const declaration of pending) {
    if (declaration.retryCount >= MAX_RETRY) {
      await updateDeclarationStatus(declaration.id!, "failed", "Max retries exceeded");
      result.failed++;
      result.errors.push({ id: declaration.id!, error: "Max retries exceeded" });
      continue;
    }

    await updateDeclarationStatus(declaration.id!, "syncing");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      const response = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          declaration: declaration.payload,
          hmac: declaration.hmac,
          idempotencyKey: declaration.idempotencyKey,
          authToken: session.access_token,
        }),
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        await deleteDeclaration(declaration.id!);
        result.synced++;
      } else if (response.status === 401) {
        // Token expired mid-sync
        await updateDeclarationStatus(declaration.id!, "pending", "Session expired");
        result.tokenExpired = true;
        result.failed++;
        result.errors.push({ id: declaration.id!, error: "Session expired" });
        break; // Stop syncing — all subsequent will also fail
      } else if (response.status === 409) {
        // Duplicate — already synced, safe to delete
        await deleteDeclaration(declaration.id!);
        result.synced++;
      } else if (response.status === 422) {
        const body = await response.json().catch(() => ({ error: "Validation failed" }));
        await updateDeclarationStatus(declaration.id!, "failed", body.error || "Validation failed");
        result.failed++;
        result.errors.push({ id: declaration.id!, error: body.error || "Validation failed" });
      } else {
        await updateDeclarationStatus(declaration.id!, "pending", `Server error: ${response.status}`);
        result.failed++;
        result.errors.push({ id: declaration.id!, error: `Server error: ${response.status}` });
      }
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError"
        ? "Request timed out — slow network"
        : err instanceof Error ? err.message : "Network error";
      await updateDeclarationStatus(declaration.id!, "pending", message);
      result.failed++;
      result.errors.push({ id: declaration.id!, error: message });
    }
  }

  return result;
}
