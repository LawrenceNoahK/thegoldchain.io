"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface HeaderProps {
  role: string;
  userName: string;
}

export function Header({ role, userName }: HeaderProps) {
  const [clock, setClock] = useState("00:00:00");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const roleLabels: Record<string, string> = {
    operator: "OPERATOR NODE",
    goldbod_officer: "GOLDBOD REGULATORY NODE",
    refinery: "REFINERY NODE",
    auditor: "AUDIT NODE",
    admin: "ADMIN NODE",
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-gc-border px-4 py-2 flex items-center justify-between bg-gc-bg">
      <div className="flex items-center gap-4">
        <span className="text-[10px] text-gc-green-dim tracking-[1px]">
          GHANA GOLD BOARD · {roleLabels[role] || "NODE"}
        </span>
        <span className="text-gc-border">·</span>
        <span className="text-[9px] text-gc-green-muted">
          {userName}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="font-vt text-xl text-gc-green glow-text tracking-[2px]">
          {clock} UTC
        </span>
        <button
          onClick={handleLogout}
          className="text-[9px] text-gc-green-dim border border-gc-border px-3 py-1 rounded-gc tracking-[1px] hover:text-gc-red hover:border-gc-red/30 transition-all"
        >
          DISCONNECT
        </button>
      </div>
    </header>
  );
}
