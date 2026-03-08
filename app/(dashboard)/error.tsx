"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="terminal-panel max-w-md w-full">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-red tracking-[2px] font-medium">
            [ DASHBOARD.ERROR ]
          </span>
          <span className="text-[9px] text-gc-red/60 tracking-[1px]">
            RECOVERABLE
          </span>
        </div>
        <div className="relative z-[1] p-6 space-y-4">
          <div className="text-[10px] text-gc-green-dim tracking-[1px]">
            $ thegoldchain dashboard --status
          </div>

          <div className="text-gc-red text-[12px] font-vt tracking-[2px]">
            DASHBOARD ERROR
          </div>

          <div className="text-gc-red/80 text-[10px] border border-gc-red/30 bg-gc-red/5 px-3 py-2 rounded-gc font-mono">
            ERR: {error.message || "An unexpected error occurred"}
          </div>

          {error.digest && (
            <div className="text-[9px] text-gc-green-muted tracking-[1px]">
              DIGEST: {error.digest}
            </div>
          )}

          <button
            onClick={reset}
            className="w-full border border-gc-green-dim bg-gc-green/5 text-gc-green text-[11px] tracking-[1px] py-2 rounded-gc font-mono hover:bg-gc-green/10 hover:border-gc-green transition-all"
          >
            [ RETRY ]
          </button>
        </div>
      </div>
    </div>
  );
}
