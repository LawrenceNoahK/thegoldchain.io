import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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

  // Fetch operator info
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

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain operator --dashboard --batches
      </div>

      {/* Operator Info Panel */}
      {operator && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "OPERATOR", value: operator.name, color: "text-gc-green" },
            { label: "LICENSE", value: operator.license_number, color: "text-gc-gold" },
            { label: "REGION", value: operator.region, color: "text-gc-green-dim" },
            { label: "STATUS", value: operator.status?.toUpperCase(), color: operator.status === "active" ? "text-gc-green" : "text-gc-red" },
          ].map((m) => (
            <div key={m.label} className="border border-gc-border bg-gc-green/[0.02] rounded-gc p-3">
              <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1">{m.label}</div>
              <div className={`text-[11px] font-mono ${m.color} truncate`}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="terminal-panel">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ MY.BATCHES ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            {batches?.length || 0} RECORDS
          </span>
        </div>
        <div className="relative z-[1] p-4">
          {!batches || batches.length === 0 ? (
            <div className="text-gc-green-dim text-[11px] py-8 text-center">
              No batches declared yet. Use DECLARE to submit your first production batch.
            </div>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gc-green-dim border-b border-gc-border">
                  <th className="text-left py-2 px-2 font-normal tracking-[1px]">BATCH_ID</th>
                  <th className="text-left py-2 px-2 font-normal tracking-[1px]">WEIGHT_KG</th>
                  <th className="text-left py-2 px-2 font-normal tracking-[1px]">STATUS</th>
                  <th className="text-left py-2 px-2 font-normal tracking-[1px]">CHAIN</th>
                  <th className="text-left py-2 px-2 font-normal tracking-[1px]">SAT_CHECK</th>
                  <th className="text-left py-2 px-2 font-normal tracking-[1px]">DATE</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch: any) => {
                  const nodes = batch.batch_nodes || [];
                  const confirmedNodes = nodes.filter((n: any) => n.status === "CONFIRMED").length;
                  const satStatus = batch.satellite_checks?.[0]?.overall_status || "PENDING";

                  // Show which specific nodes are confirmed
                  const nodeIndicators = [1, 2, 3, 4].map((num) => {
                    const node = nodes.find((n: any) => n.node_number === num);
                    if (!node) return "text-gc-border";
                    if (node.status === "CONFIRMED") return "text-gc-green";
                    if (node.status === "FLAGGED") return "text-gc-red";
                    return "text-gc-amber";
                  });

                  const statusColor =
                    batch.status === "CERTIFIED" ? "text-gc-green" :
                    batch.status === "FLAGGED" ? "text-gc-red" :
                    batch.status === "PENDING" ? "text-gc-amber" : "text-gc-green-mid";

                  return (
                    <tr key={batch.id} className="border-b border-gc-border/50 hover:bg-gc-green/5 transition-all">
                      <td className="py-2 px-2 text-gc-green-mid">{batch.batch_id}</td>
                      <td className="py-2 px-2 text-gc-gold font-mono">{batch.declared_weight_kg}</td>
                      <td className={`py-2 px-2 ${statusColor}`}>[{batch.status}]</td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1 items-center">
                          {nodeIndicators.map((color, i) => (
                            <span key={i} className={`text-[8px] ${color}`}>
                              {color === "text-gc-green" ? "\u25CF" : color === "text-gc-red" ? "\u25CF" : "\u25CB"}
                            </span>
                          ))}
                          <span className="text-gc-green-dim text-[8px] ml-1">{confirmedNodes}/4</span>
                        </div>
                      </td>
                      <td className={`py-2 px-2 ${satStatus === "PASS" ? "text-gc-green" : satStatus === "FAIL" ? "text-gc-red" : "text-gc-amber"}`}>
                        {satStatus}
                      </td>
                      <td className="py-2 px-2 text-gc-green-muted">
                        {new Date(batch.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
