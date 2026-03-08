// ============================================================
// THE GOLDCHAIN — Status Badge
// Consistent batch status display with color mapping
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  CERTIFIED: "text-gc-green",
  FLAGGED: "text-gc-red",
  PENDING: "text-gc-amber",
  NODE_02_APPROVED: "text-gc-green-mid",
  NODE_03_CONFIRMED: "text-gc-green-mid",
};

const SAT_COLORS: Record<string, string> = {
  PASS: "text-gc-green",
  FAIL: "text-gc-red",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "text-gc-amber";
  return <span className={color}>[{status}]</span>;
}

export function SatBadge({ status }: { status: string }) {
  const color = SAT_COLORS[status] || "text-gc-amber";
  return <span className={color}>{status}</span>;
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || "text-gc-amber";
}
