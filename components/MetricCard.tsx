// ============================================================
// THE GOLDCHAIN — Metric Card
// Stats card used in dashboard metric strips
// ============================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  color?: string;
}

export function MetricCard({ label, value, color = "text-gc-green" }: MetricCardProps) {
  return (
    <div className="border border-gc-border bg-gc-green/[0.02] rounded-gc p-3">
      <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1">
        {label}
      </div>
      <div className={`text-xl font-vt tracking-[1px] ${color}`}>{value}</div>
    </div>
  );
}

export function InfoCard({
  label,
  value,
  color = "text-gc-green",
}: MetricCardProps) {
  return (
    <div className="border border-gc-border bg-gc-green/[0.02] rounded-gc p-3">
      <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1">
        {label}
      </div>
      <div className={`text-[11px] font-mono ${color} truncate`}>{value}</div>
    </div>
  );
}
