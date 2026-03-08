// ============================================================
// !! WARNING — SERVICE ROLE CLIENT !!
// !! NEVER import this file in client-side code !!
// !! NEVER import this file in Server Components !!
// !! NEVER import this file in middleware !!
// !!
// !! This client bypasses Row Level Security (RLS).
// !! It should ONLY be used in:
// !!   - Server Actions (lib/actions/)
// !!   - Supabase Edge Functions (supabase/functions/)
// !!   - API routes that are not user-facing
// !!
// !! RLS is the real security layer — per CLAUDE.md rules.
// !! If you're reading this and about to import it in a
// !! component or page, STOP and use the regular server client.
// ============================================================

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable. " +
      "The admin client requires the service role key."
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
