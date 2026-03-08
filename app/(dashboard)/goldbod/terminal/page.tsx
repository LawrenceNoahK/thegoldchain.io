"use client";

export default function TerminalPage() {
  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain terminal --live --phosphor
      </div>

      <div className="terminal-panel">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ THE GOLDCHAIN.TERMINAL ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            MODULE 7
          </span>
        </div>
        <div className="relative z-[1] p-8 text-center">
          <div className="text-gc-green-dim text-[11px]">
            Terminal dashboard will be wired to live Supabase data in Module 7.
          </div>
          <div className="text-gc-border text-[9px] mt-2 tracking-[1px]">
            SEE goldchain-v1.html FOR DESIGN REFERENCE
          </div>
        </div>
      </div>
    </div>
  );
}
