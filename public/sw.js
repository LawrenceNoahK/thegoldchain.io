// ============================================================
// THE GOLDCHAIN — Service Worker
// Cache-first for shell, network-first for data, background sync
// ============================================================

const SHELL_CACHE = "goldchain-shell-v2";
const DATA_CACHE = "goldchain-data-v2";

// App shell files to pre-cache on install
const SHELL_FILES = [
  "/manifest.json",
];

// Sync lock to prevent concurrent sync operations
let syncInProgress = false;

// ---- Install: pre-cache app shell ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// ---- Activate: clean old caches, notify clients of update ----
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      );
      // Notify all clients that a new version is available
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ type: "SW_UPDATED" });
      }
    })
  );
  self.clients.claim();
});

// ---- Fetch: route through caching strategies ----
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API routes and auth
  if (url.pathname.startsWith("/api/")) return;

  // Static assets (Next.js build output): cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Font files: cache-first with long TTL
  if (
    url.pathname.includes("/fonts/") ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Supabase REST API (GET only): network-first, stale fallback
  if (url.hostname.includes("supabase")) {
    event.respondWith(networkFirst(request, DATA_CACHE, 5 * 60 * 1000));
    return;
  }

  // HTML pages: network-first (always try to get fresh)
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request, SHELL_CACHE, 60 * 60 * 1000));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(request, SHELL_CACHE, 60 * 60 * 1000));
});

// ---- Background Sync: drain offline declaration queue ----
self.addEventListener("sync", (event) => {
  if (event.tag === "goldchain-declarations") {
    event.waitUntil(syncDeclarations());
  }
});

async function syncDeclarations() {
  // Prevent concurrent sync (main thread drainQueue may also be running)
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    const db = await openIndexedDB();
    const tx = db.transaction("pending-declarations", "readonly");
    const store = tx.objectStore("pending-declarations");
    const index = store.index("status");
    const pending = await getAllFromIndex(index, "pending");

    if (pending.length === 0) {
      syncInProgress = false;
      return;
    }

    for (const declaration of pending) {
      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            declaration: declaration.payload,
            hmac: declaration.hmac,
            idempotencyKey: declaration.idempotencyKey,
            // SW cannot get fresh token — it uses the last known token
            // If this fails with 401, the main thread drainQueue will handle it
            authToken: declaration.authToken || "",
          }),
        });

        const updateTx = db.transaction("pending-declarations", "readwrite");
        const updateStore = updateTx.objectStore("pending-declarations");

        if (response.ok || response.status === 409) {
          // Success or duplicate — safe to delete
          await deleteRecord(updateStore, declaration.id);
        } else if (response.status === 401) {
          // Token expired — leave for main thread drainQueue to handle
          declaration.errorMessage = "Session expired";
          await putRecord(updateStore, declaration);
        } else if (response.status === 422) {
          declaration.status = "failed";
          declaration.errorMessage = "Validation failed";
          declaration.retryCount += 1;
          await putRecord(updateStore, declaration);
        } else {
          declaration.retryCount += 1;
          declaration.errorMessage = "Server error: " + response.status;
          await putRecord(updateStore, declaration);
        }
      } catch {
        // Network still down — leave as pending
      }
    }

    // Notify clients that sync completed
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: "SYNC_COMPLETE" });
    }
  } catch {
    // IndexedDB not available
  } finally {
    syncInProgress = false;
  }
}

// ---- Caching Strategies ----

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request, cacheName, maxAge) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", Date.now().toString());
      const cachedResponse = new Response(await response.clone().blob(), {
        status: response.status,
        headers,
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      // Check if cache is still within maxAge
      const cachedAt = parseInt(cached.headers.get("sw-cached-at") || "0");
      if (Date.now() - cachedAt < maxAge) {
        return cached;
      }
      // Serve stale anyway — better than nothing
      return cached;
    }
    return new Response("Offline", { status: 503 });
  }
}

// ---- IndexedDB Helpers (for Service Worker context) ----

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("goldchain-offline", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains("pending-declarations")) {
        db.deleteObjectStore("pending-declarations");
      }
      const store = db.createObjectStore("pending-declarations", {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("status", "status");
      store.createIndex("createdAt", "createdAt");
      store.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromIndex(index, value) {
  return new Promise((resolve, reject) => {
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(store, id) {
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function putRecord(store, record) {
  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
