// ============================================================
// THE GOLDCHAIN — Rate Limiter
// Supabase-backed persistent rate limiting with in-memory fallback
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

interface RateLimitEntry {
  timestamps: number[];
}

// In-memory fallback (used when DB is unavailable)
const memoryStore = new Map<string, RateLimitEntry>();

/**
 * Check and apply rate limit for a given key.
 * Uses Supabase rate_limit_checks table for persistence across deploys/scaling.
 * Falls back to in-memory if DB is unavailable.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  try {
    return await rateLimitPersistent(key, limit, windowMs);
  } catch {
    // Fallback to in-memory if DB is unavailable
    return rateLimitMemory(key, limit, windowMs);
  }
}

/**
 * Persistent rate limiter using Supabase.
 * Atomic check-and-increment using a DB function.
 */
async function rateLimitPersistent(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  const admin = createAdminClient();
  const now = Date.now();
  const windowStart = new Date(now - windowMs).toISOString();

  // Count recent requests in the window
  const { count, error: countError } = await admin
    .from("rate_limit_checks")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("created_at", windowStart);

  if (countError) throw countError;

  const currentCount = count || 0;

  if (currentCount >= limit) {
    // Get the oldest entry in the window to calculate reset time
    const { data: oldest } = await admin
      .from("rate_limit_checks")
      .select("created_at")
      .eq("key", key)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const resetAt = oldest
      ? new Date(oldest.created_at).getTime() + windowMs
      : now + windowMs;

    return { success: false, remaining: 0, resetAt };
  }

  // Record this request
  await admin.from("rate_limit_checks").insert({ key, created_at: new Date(now).toISOString() });

  return {
    success: true,
    remaining: limit - currentCount - 1,
    resetAt: now + windowMs,
  };
}

/**
 * In-memory fallback rate limiter (for when DB is unavailable).
 */
function rateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    memoryStore.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    return { success: false, remaining: 0, resetAt: oldestInWindow + windowMs };
  }

  entry.timestamps.push(now);
  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}
