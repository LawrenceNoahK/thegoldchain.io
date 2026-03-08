// ============================================================
// THE GOLDCHAIN — HMAC Tamper Prevention for Offline Declarations
//
// Two-layer HMAC:
// - Client-side: signs payload with a server-issued secret (fetched
//   while online, cached in memory only — NOT stored in IndexedDB).
// - Server-side: re-verifies using the same secret from DB.
//
// The HMAC secret is stored in the `hmac_secrets` table and is
// fetched via Supabase RLS (user can only read their own).
// It is NEVER stored in IndexedDB alongside the declaration.
// ============================================================

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const encoder = new TextEncoder();

// In-memory cache for HMAC secret (survives page navigation, not refresh)
let cachedSecret: string | null = null;

/**
 * Fetch the user's HMAC secret from the server.
 * Caches in memory (not IndexedDB) so it cannot be extracted.
 */
export async function fetchHmacSecret(
  supabaseClient: { from: (table: string) => any }
): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const { data, error } = await supabaseClient
    .from("hmac_secrets")
    .select("secret")
    .single();

  if (error || !data?.secret) {
    throw new Error("HMAC secret not available. Please ensure you are online and authenticated.");
  }

  cachedSecret = data.secret as string;
  return cachedSecret!;
}

/**
 * Clear the cached secret (call on logout).
 */
export function clearHmacSecret(): void {
  cachedSecret = null;
}

/**
 * Check if we have a cached HMAC secret available.
 */
export function hasHmacSecret(): boolean {
  return cachedSecret !== null;
}

/**
 * Derive a CryptoKey from the HMAC secret.
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = encoder.encode(secret);
  return crypto.subtle.importKey("raw", keyMaterial, ALGORITHM, false, ["sign", "verify"]);
}

/**
 * Sign a payload with the HMAC secret.
 * Returns a hex-encoded HMAC string.
 */
export async function signPayload(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const key = await deriveKey(secret);
  const data = encoder.encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify an HMAC against a payload using the secret.
 * Returns true if the payload has not been tampered with.
 */
export async function verifyPayload(
  payload: Record<string, unknown>,
  hmac: string,
  secret: string
): Promise<boolean> {
  const key = await deriveKey(secret);
  const data = encoder.encode(JSON.stringify(payload));
  const signatureBytes = new Uint8Array(
    hmac.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, data);
}
