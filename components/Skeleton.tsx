// ============================================================
// THE GOLDCHAIN — Skeleton Loading Components
// Terminal-themed loading states for all dashboard views
// ============================================================

import { TerminalPanel } from "./TerminalPanel";

export function Pulse({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-gc-green/10 rounded-gc animate-pulse ${className}`}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="border border-gc-border bg-gc-green/[0.02] rounded-gc p-3">
      <Pulse className="h-3 w-16 mb-2" />
      <Pulse className="h-6 w-10" />
    </div>
  );
}

export function MetricStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <tr className="border-b border-gc-border/30">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-2 px-2">
          <Pulse className="h-3 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 6,
  title = "LOADING",
}: {
  rows?: number;
  columns?: number;
  title?: string;
}) {
  return (
    <TerminalPanel title={title} subtitle="...">
      <div className="p-4">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-gc-green-dim border-b border-gc-border">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="text-left py-2 px-2 font-normal tracking-[1px]">
                  <Pulse className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRowSkeleton key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </TerminalPanel>
  );
}

export function DashboardSkeleton({
  command,
  metricCount = 4,
  tableRows = 5,
  tableColumns = 6,
  tableTitle = "LOADING",
}: {
  command: string;
  metricCount?: number;
  tableRows?: number;
  tableColumns?: number;
  tableTitle?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ {command}
      </div>
      {metricCount > 0 && <MetricStripSkeleton count={metricCount} />}
      <TableSkeleton rows={tableRows} columns={tableColumns} title={tableTitle} />
    </div>
  );
}
