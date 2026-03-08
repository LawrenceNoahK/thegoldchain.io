"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="terminal-panel max-w-lg w-full">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
          </div>
          <span className="text-[10px] text-gc-red tracking-[2px] font-medium">
            [ SYSTEM.ERROR ]
          </span>
          <span className="text-[9px] text-gc-red/60 tracking-[1px]">
            FATAL
          </span>
        </div>
        <div className="relative z-[1] p-8 space-y-4">
          <div className="text-[10px] text-gc-green-dim tracking-[1px]">
            $ thegoldchain --status
          </div>

          <div className="text-gc-red text-[14px] font-vt tracking-[2px]">
            SYSTEM ERROR DETECTED
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

          <div className="text-[8px] text-gc-border tracking-[1px] text-center">
            THE GOLDCHAIN · GHANA GOLD BOARD ACT 2025 (ACT 1140)
          </div>
        </div>
      </div>
    </div>
  );
}
