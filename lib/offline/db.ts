// ============================================================
// THE GOLDCHAIN — IndexedDB Offline Storage
// Stores pending declarations for background sync
// ============================================================

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "goldchain-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-declarations";

export interface PendingDeclaration {
  id?: number;
  payload: {
    declared_weight_kg: number;
    gps_lat: number | null;
    gps_lng: number | null;
    field_notes: string | null;
    captured_at: string;
  };
  hmac: string;
  authToken: string;
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("status", "status");
          store.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

export async function addPendingDeclaration(
  declaration: Omit<PendingDeclaration, "id">
): Promise<number> {
  const db = await getDB();
  const id = await db.add(STORE_NAME, declaration);
  return id as number;
}

export async function getPendingDeclarations(): Promise<PendingDeclaration[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, "status", "pending");
}

export async function getAllDeclarations(): Promise<PendingDeclaration[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function updateDeclarationStatus(
  id: number,
  status: PendingDeclaration["status"],
  errorMessage?: string
): Promise<void> {
  const db = await getDB();
  const declaration = await db.get(STORE_NAME, id);
  if (declaration) {
    declaration.status = status;
    if (errorMessage) declaration.errorMessage = errorMessage;
    if (status === "failed") declaration.retryCount += 1;
    await db.put(STORE_NAME, declaration);
  }
}

export async function deleteDeclaration(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.countFromIndex(STORE_NAME, "status", "pending");
}

export async function clearSyncedDeclarations(): Promise<void> {
  const db = await getDB();
  const synced = await db.getAllFromIndex(STORE_NAME, "status", "synced");
  const tx = db.transaction(STORE_NAME, "readwrite");
  for (const item of synced) {
    if (item.id) tx.store.delete(item.id);
  }
  await tx.done;
}
