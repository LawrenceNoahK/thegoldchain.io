import { TerminalPanel } from "@/components/TerminalPanel";

function Pulse({ className = "" }: { className?: string }) {
  return <div className={`bg-gc-green/10 rounded-gc animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-4 max-w-xl">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain declare --node-01 --production
      </div>

      <TerminalPanel title="NODE.01.MINE.DECLARATION" subtitle="FIELD FORM">
        <div className="p-6 space-y-4">
          <Pulse className="h-10 w-full" />
          <Pulse className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Pulse className="h-10 w-full" />
            <Pulse className="h-10 w-full" />
          </div>
          <Pulse className="h-20 w-full" />
          <Pulse className="h-12 w-full" />
        </div>
      </TerminalPanel>
    </div>
  );
}
