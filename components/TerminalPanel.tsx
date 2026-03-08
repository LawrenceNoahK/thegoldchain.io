// ============================================================
// THE GOLDCHAIN — Terminal Panel
// Reusable macOS-style terminal panel with titlebar dots
// ============================================================

import { ReactNode } from "react";

interface TerminalPanelProps {
  title: string;
  subtitle?: string;
  titleColor?: string;
  children: ReactNode;
  className?: string;
}

export function TerminalPanel({
  title,
  subtitle,
  titleColor = "text-gc-green",
  children,
  className = "",
}: TerminalPanelProps) {
  return (
    <div className={`terminal-panel ${className}`}>
      <div className="panel-titlebar">
        <div className="flex gap-[5px]">
          <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
          <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
          <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
        </div>
        <span className={`text-[10px] ${titleColor} tracking-[2px] font-medium`}>
          [ {title} ]
        </span>
        {subtitle && (
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            {subtitle}
          </span>
        )}
      </div>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
