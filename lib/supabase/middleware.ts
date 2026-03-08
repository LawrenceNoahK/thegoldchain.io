import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes — no auth required
  if (
    pathname.startsWith("/verify/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/sw.js") ||
    pathname === "/favicon.ico"
  ) {
    return supabaseResponse;
  }

  // Not logged in — redirect to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Get user role for route-based access control
  if (pathname.startsWith("/operator") || pathname.startsWith("/goldbod") || pathname.startsWith("/refinery")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile) {
      const role = profile.role;
      const isAdmin = role === "admin";

      if (pathname.startsWith("/operator") && role !== "operator" && !isAdmin) {
        return NextResponse.redirect(new URL(`/${role === "goldbod_officer" ? "goldbod" : role}/dashboard`, request.url));
      }
      if (pathname.startsWith("/goldbod") && role !== "goldbod_officer" && !isAdmin) {
        return NextResponse.redirect(new URL(`/${role}/dashboard`, request.url));
      }
      if (pathname.startsWith("/refinery") && role !== "refinery" && !isAdmin) {
        return NextResponse.redirect(new URL(`/${role === "goldbod_officer" ? "goldbod" : role}/dashboard`, request.url));
      }
    }
  }

  return supabaseResponse;
}
