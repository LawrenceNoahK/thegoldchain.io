import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TerminalPanel } from "@/components/TerminalPanel";
import { InfoCard } from "@/components/MetricCard";
import { StatusBadge, SatBadge } from "@/components/StatusBadge";
import { ChainProgress } from "@/components/ChainProgress";
import { BatchTable, type Column } from "@/components/BatchTable";

export default async function OperatorDashboard() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("operator_id")
    .eq("id", user.id)
    .single();

  if (!profile?.operator_id) {
    return (
      <div className="text-gc-red text-[11px] p-4">
        ERR: No operator linked to this account. Contact your administrator.
      </div>
    );
  }

  const { data: operator } = await supabase
    .from("operators")
    .select("name, license_number, region, status")
    .eq("id", profile.operator_id)
    .single();

  const { data: batches } = await supabase
    .from("gold_batches")
    .select(`
      *,
      batch_nodes (node_number, status, tx_hash, timestamp),
      satellite_checks (overall_status)
    `)
    .eq("operator_id", profile.operator_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const columns: Column<any>[] = [
    {
      key: "batch_id",
      label: "BATCH_ID",
      render: (b) => <span className="text-gc-green-mid">{b.batch_id}</span>,
    },
    {
      key: "weight",
      label: "WEIGHT_KG",
      render: (b) => <span className="text-gc-gold font-mono">{b.declared_weight_kg}</span>,
    },
    {
      key: "status",
      label: "STATUS",
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: "chain",
      label: "CHAIN",
      render: (b) => <ChainProgress nodes={b.batch_nodes || []} />,
    },
    {
      key: "sat",
      label: "SAT_CHECK",
      render: (b) => <SatBadge status={b.satellite_checks?.[0]?.overall_status || "PENDING"} />,
    },
    {
      key: "date",
      label: "DATE",
      render: (b) => (
        <span className="text-gc-green-muted">
          {new Date(b.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain operator --dashboard --batches
      </div>

      {operator && (
        <div className="grid grid-cols-4 gap-3">
          <InfoCard label="OPERATOR" value={operator.name} color="text-gc-green" />
          <InfoCard label="LICENSE" value={operator.license_number} color="text-gc-gold" />
          <InfoCard label="REGION" value={operator.region} color="text-gc-green-dim" />
          <InfoCard
            label="STATUS"
            value={operator.status?.toUpperCase()}
            color={operator.status === "active" ? "text-gc-green" : "text-gc-red"}
          />
        </div>
      )}

      <TerminalPanel title="MY.BATCHES" subtitle={`${batches?.length || 0} RECORDS`}>
        <div className="p-4">
          <BatchTable
            columns={columns}
            data={batches || []}
            rowKey={(b) => b.id}
            emptyMessage="No batches declared yet. Use DECLARE to submit your first production batch."
          />
        </div>
      </TerminalPanel>
    </div>
  );
}
