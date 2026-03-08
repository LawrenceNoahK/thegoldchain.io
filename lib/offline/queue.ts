// ============================================================
// THE GOLDCHAIN — Offline Declaration Queue
// Manages enqueue, sync, and retry for offline declarations
// ============================================================

import {
  addPendingDeclaration,
  getPendingDeclarations,
  updateDeclarationStatus,
  deleteDeclaration,
  type PendingDeclaration,
} from "./db";
import { signPayload } from "./hmac";

const MAX_RETRY = 5;
const SYNC_ENDPOINT = "/api/sync";

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
  accessToken: string
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

  // HMAC sign the payload to prevent tampering in IndexedDB
  const hmac = await signPayload(payload as Record<string, unknown>, accessToken);

  const id = await addPendingDeclaration({
    payload,
    hmac,
    authToken: accessToken,
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
};

/**
 * Drain the offline queue by sending pending declarations to the server.
 * Called by Service Worker on sync event or by the app on reconnect.
 */
export async function drainQueue(): Promise<SyncResult> {
  const pending = await getPendingDeclarations();
  const result: SyncResult = { total: pending.length, synced: 0, failed: 0, errors: [] };

  if (pending.length === 0) return result;

  for (const declaration of pending) {
    if (declaration.retryCount >= MAX_RETRY) {
      await updateDeclarationStatus(declaration.id!, "failed", "Max retries exceeded");
      result.failed++;
      result.errors.push({ id: declaration.id!, error: "Max retries exceeded" });
      continue;
    }

    await updateDeclarationStatus(declaration.id!, "syncing");

    try {
      const response = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declaration: declaration.payload,
          hmac: declaration.hmac,
          authToken: declaration.authToken,
        }),
      });

      if (response.ok) {
        await deleteDeclaration(declaration.id!);
        result.synced++;
      } else if (response.status === 401) {
        // Token expired — mark as pending for retry after re-login
        await updateDeclarationStatus(declaration.id!, "pending", "Auth token expired — will retry after login");
        result.failed++;
        result.errors.push({ id: declaration.id!, error: "Auth token expired" });
      } else if (response.status === 422) {
        // Validation failed — mark as failed permanently
        const body = await response.json().catch(() => ({ error: "Validation failed" }));
        await updateDeclarationStatus(declaration.id!, "failed", body.error || "Validation failed");
        result.failed++;
        result.errors.push({ id: declaration.id!, error: body.error || "Validation failed" });
      } else {
        // Server error — retry later
        await updateDeclarationStatus(declaration.id!, "pending", `Server error: ${response.status}`);
        result.failed++;
        result.errors.push({ id: declaration.id!, error: `Server error: ${response.status}` });
      }
    } catch (err) {
      // Network error — keep as pending
      await updateDeclarationStatus(
        declaration.id!,
        "pending",
        err instanceof Error ? err.message : "Network error"
      );
      result.failed++;
      result.errors.push({ id: declaration.id!, error: "Network error" });
    }
  }

  return result;
}
