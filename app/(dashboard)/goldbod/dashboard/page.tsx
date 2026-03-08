"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { approveAction } from "@/lib/actions/approvals";

export default function GoldbodDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  async function fetchBatches() {
    const supabase = createClient();
    const { data } = await supabase
      .from("gold_batches")
      .select(`
        *,
        operators (name, license_number, region),
        batch_nodes (node_number, status, tx_hash, timestamp, data),
        satellite_checks (overall_status, flagged_details)
      `)
      .order("created_at", { ascending: false })
      .limit(50);
    setBatches(data || []);
  }

  useEffect(() => {
    fetchBatches();
  }, []);

  async function handleApprove(batch: any) {
    setActionLoading(batch.id);
    setActionError((prev) => {
      const next = { ...prev };
      delete next[batch.id];
      return next;
    });

    try {
      const result = await approveAction({ batch_id: batch.id });

      if (result.success) {
        await fetchBatches();
      } else {
        setActionError((prev) => ({ ...prev, [batch.id]: result.error }));
      }
    } catch {
      setActionError((prev) => ({ ...prev, [batch.id]: "Approval request failed" }));
    } finally {
      setActionLoading(null);
    }
  }

  const pending = batches.filter((b) => b.status === "PENDING");
  const approved = batches.filter((b) => b.status === "NODE_02_APPROVED");
  const flagged = batches.filter((b) => b.status === "FLAGGED");
  const certified = batches.filter((b) => b.status === "CERTIFIED");

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain goldbod --dashboard --all-batches --realtime
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "PENDING_REVIEW", value: pending.length, color: "text-gc-amber" },
          { label: "APPROVED", value: approved.length, color: "text-gc-green" },
          { label: "FLAGGED", value: flagged.length, color: "text-gc-red" },
          { label: "CERTIFIED", value: certified.length, color: "text-gc-green glow-text" },
        ].map((m) => (
          <div key={m.label} className="border border-gc-border bg-gc-green/[0.02] rounded-gc p-3">
            <div className="text-[8px] text-gc-green-muted tracking-[1px] mb-1">{m.label}</div>
            <div className={`text-xl font-vt tracking-[1px] ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Batch table */}
      <div className="terminal-panel">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ ALL.BATCHES.LIVE ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            {batches.length} TOTAL
          </span>
        </div>
        <div className="relative z-[1] p-4 overflow-x-auto">
          <table className="w-full text-[10px] min-w-[700px]">
            <thead>
              <tr className="text-gc-green-dim border-b border-gc-border">
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">BATCH_ID</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">OPERATOR</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">REGION</th>
                <th className="text-right py-2 px-2 font-normal tracking-[1px]">WEIGHT_KG</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">STATUS</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">CHAIN</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">SAT</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch: any) => {
                const confirmedNodes = batch.batch_nodes?.filter((n: any) => n.status === "CONFIRMED").length || 0;
                const satStatus = batch.satellite_checks?.[0]?.overall_status || "\u2014";
                const statusColor =
                  batch.status === "CERTIFIED" ? "text-gc-green" :
                  batch.status === "FLAGGED" ? "text-gc-red" :
                  batch.status === "NODE_02_APPROVED" ? "text-gc-green-mid" :
                  "text-gc-amber";

                return (
                  <tr key={batch.id} className="border-b border-gc-border/30 hover:bg-gc-green/5 transition-all">
                    <td className="py-2 px-2 text-gc-green-mid font-mono">{batch.batch_id}</td>
                    <td className="py-2 px-2 text-gc-green-dim">{batch.operators?.name}</td>
                    <td className="py-2 px-2 text-gc-green-muted">{batch.operators?.region}</td>
                    <td className="py-2 px-2 text-gc-gold text-right font-mono">{batch.declared_weight_kg}</td>
                    <td className={`py-2 px-2 ${statusColor}`}>[{batch.status}]</td>
                    <td className="py-2 px-2 text-gc-green-dim">{confirmedNodes}/4</td>
                    <td className={`py-2 px-2 ${satStatus === "PASS" ? "text-gc-green" : satStatus === "FAIL" ? "text-gc-red" : "text-gc-amber"}`}>
                      {satStatus}
                    </td>
                    <td className="py-2 px-2">
                      {batch.status === "PENDING" && satStatus === "PASS" && (
                        <div className="space-y-1">
                          <button
                            onClick={() => handleApprove(batch)}
                            disabled={actionLoading === batch.id}
                            className="text-[9px] text-gc-green border border-gc-green/30 px-2 py-1 rounded-gc hover:bg-gc-green/10 transition-all tracking-[0.5px] disabled:opacity-50"
                          >
                            {actionLoading === batch.id ? (
                              <span className="animate-blink">...</span>
                            ) : (
                              "APPROVE"
                            )}
                          </button>
                          {actionError[batch.id] && (
                            <div className="text-[8px] text-gc-red max-w-[120px] truncate" title={actionError[batch.id]}>
                              {actionError[batch.id]}
                            </div>
                          )}
                        </div>
                      )}
                      {batch.status === "FLAGGED" && (
                        <span className="text-[9px] text-gc-red tracking-[0.5px]">REVIEW</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
