"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  role: string;
}

const NAV_ITEMS: Record<string, { label: string; href: string; icon: string }[]> = {
  operator: [
    { label: "DASHBOARD", href: "/operator/dashboard", icon: ">" },
    { label: "DECLARE", href: "/operator/declare", icon: "+" },
  ],
  goldbod_officer: [
    { label: "DASHBOARD", href: "/goldbod/dashboard", icon: ">" },
    { label: "TERMINAL", href: "/goldbod/terminal", icon: "$" },
  ],
  refinery: [
    { label: "DASHBOARD", href: "/refinery/dashboard", icon: ">" },
  ],
  admin: [
    { label: "GOLDBOD", href: "/goldbod/dashboard", icon: ">" },
    { label: "TERMINAL", href: "/goldbod/terminal", icon: "$" },
    { label: "OPERATORS", href: "/operator/dashboard", icon: "#" },
    { label: "REFINERY", href: "/refinery/dashboard", icon: "~" },
  ],
};

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS[role] || NAV_ITEMS.operator;

  return (
    <aside className="w-48 border-r border-gc-border bg-gc-bg flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-gc-border">
        <pre className="font-vt text-[7px] leading-tight text-gc-green-dim select-none">
{`████████╗ ██████╗  ██████╗
╚══██╔══╝██╔════╝ ██╔════╝
   ██║   ██║  ███╗██║
   ██║   ██║   ██║██║
   ██║   ╚██████╔╝╚██████╗
   ╚═╝    ╚═════╝  ╚═════╝`}
        </pre>
        <div className="text-[7px] text-gc-green-muted tracking-[1.5px] mt-1">
          THE GOLDCHAIN
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-[10px] tracking-[1px] rounded-gc transition-all",
                isActive
                  ? "bg-gc-green/10 text-gc-green border border-gc-green/30 glow-text"
                  : "text-gc-green-dim hover:text-gc-green hover:bg-gc-green/5 border border-transparent"
              )}
            >
              <span className="text-gc-green-dim font-mono">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-3 border-t border-gc-border space-y-1">
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gc-green">●</span>
          <span className="text-gc-green-dim tracking-[1px]">NETWORK LIVE</span>
        </div>
        <div className="text-[7px] text-gc-border tracking-[1px]">
          v1.0.0 · ACT 1140
        </div>
      </div>
    </aside>
  );
}
