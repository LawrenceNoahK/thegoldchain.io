import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingNodes } from "@/lib/fabric";

/**
 * POST /api/fabric/process
 *
 * Process all PENDING_FABRIC batch nodes by submitting them to Hyperledger Fabric.
 * When Fabric is not configured, generates deterministic stub TX hashes.
 *
 * Protected: requires admin role.
 * Intended to be called by cron job or manually.
 */
export async function POST() {
  try {
    const supabase = createClient();

    // Auth check — admin only
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const result = await processPendingNodes(supabase);

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
