import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect based on role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  switch (profile.role) {
    case "operator":
      redirect("/operator/dashboard");
    case "goldbod_officer":
      redirect("/goldbod/dashboard");
    case "refinery":
      redirect("/refinery/dashboard");
    case "auditor":
      redirect("/goldbod/dashboard");
    case "admin":
      redirect("/goldbod/dashboard");
    default:
      redirect("/login");
  }
}
