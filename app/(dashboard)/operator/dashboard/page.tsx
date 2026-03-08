import { createClient } from "@/lib/supabase/server";

export default async function OperatorDashboard() {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("operator_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id)
    .single();

  const { data: batches } = await supabase
    .from("gold_batches")
    .select(`
      *,
      batch_nodes (node_number, status, tx_hash, timestamp),
      satellite_checks (overall_status)
    `)
    .eq("operator_id", profile?.operator_id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain operator --dashboard --batches
      </div>

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
                  const confirmedNodes = batch.batch_nodes?.filter((n: any) => n.status === "CONFIRMED").length || 0;
                  const satStatus = batch.satellite_checks?.[0]?.overall_status || "PENDING";
                  const statusColor =
                    batch.status === "CERTIFIED" ? "text-gc-green" :
                    batch.status === "FLAGGED" ? "text-gc-red" :
                    batch.status === "PENDING" ? "text-gc-amber" : "text-gc-green-mid";

                  return (
                    <tr key={batch.id} className="border-b border-gc-border/50 hover:bg-gc-green/5 transition-all">
                      <td className="py-2 px-2 text-gc-green-mid">{batch.batch_id}</td>
                      <td className="py-2 px-2 text-gc-gold font-mono">{batch.declared_weight_kg}</td>
                      <td className={`py-2 px-2 ${statusColor}`}>[{batch.status}]</td>
                      <td className="py-2 px-2 text-gc-green-dim">{confirmedNodes}/4 nodes</td>
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
