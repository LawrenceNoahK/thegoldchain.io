// ============================================================
// THE GOLDCHAIN — HMAC Tamper Prevention for Offline Declarations
//
// Signs declaration payloads with a key derived from the user's
// session token. Prevents modification of queued declarations
// in IndexedDB (e.g., changing GPS coordinates after capture).
// ============================================================

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const encoder = new TextEncoder();

/**
 * Derive a CryptoKey from the user's access token.
 * Uses the token as key material for HMAC signing.
 */
async function deriveKey(token: string): Promise<CryptoKey> {
  const keyMaterial = encoder.encode(token);
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    ALGORITHM,
    false,
    ["sign", "verify"]
  );
}

/**
 * Sign a payload with the user's access token.
 * Returns a hex-encoded HMAC string.
 */
export async function signPayload(
  payload: Record<string, unknown>,
  accessToken: string
): Promise<string> {
  const key = await deriveKey(accessToken);
  const data = encoder.encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify an HMAC against a payload using the access token.
 * Returns true if the payload has not been tampered with.
 */
export async function verifyPayload(
  payload: Record<string, unknown>,
  hmac: string,
  accessToken: string
): Promise<boolean> {
  const key = await deriveKey(accessToken);
  const data = encoder.encode(JSON.stringify(payload));
  const signatureBytes = new Uint8Array(
    hmac.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, data);
}
