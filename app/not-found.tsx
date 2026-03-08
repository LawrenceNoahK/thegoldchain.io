import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="terminal-panel max-w-lg w-full">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-amber tracking-[2px] font-medium">
            [ SYSTEM.404 ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            NOT FOUND
          </span>
        </div>
        <div className="relative z-[1] p-8 space-y-4 text-center">
          <div className="text-[10px] text-gc-green-dim tracking-[1px]">
            $ thegoldchain resolve --path
          </div>

          <div className="text-gc-amber text-[48px] font-vt tracking-[4px] glow-gold leading-none">
            404
          </div>

          <div className="text-gc-green text-[14px] font-vt tracking-[2px]">
            RESOURCE NOT FOUND
          </div>

          <div className="text-gc-green-dim text-[10px] border border-gc-border bg-gc-green/[0.02] px-3 py-2 rounded-gc font-mono">
            The requested path does not exist on this node.
          </div>

          <Link
            href="/"
            className="inline-block border border-gc-green-dim bg-gc-green/5 text-gc-green text-[11px] tracking-[1px] py-2 px-6 rounded-gc font-mono hover:bg-gc-green/10 hover:border-gc-green transition-all"
          >
            [ RETURN TO BASE NODE ]
          </Link>

          <div className="text-[8px] text-gc-border tracking-[1px]">
            THE GOLDCHAIN · GHANA GOLD BOARD ACT 2025 (ACT 1140)
          </div>
        </div>
      </div>
    </div>
  );
}
