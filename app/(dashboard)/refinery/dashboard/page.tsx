"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { intakeAction } from "@/lib/actions/intake";

export default function RefineryDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [actionWarning, setActionWarning] = useState<Record<string, string>>({});
  const [intakeWeight, setIntakeWeight] = useState<Record<string, string>>({});

  const fetchBatches = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("gold_batches")
      .select(`
        *,
        operators (name, region),
        batch_nodes (node_number, status, tx_hash, timestamp, data)
      `)
      .in("status", ["NODE_02_APPROVED", "NODE_03_CONFIRMED", "CERTIFIED"])
      .order("created_at", { ascending: false })
      .limit(30);
    setBatches(data || []);
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Client-side weight discrepancy check
  function getWeightDiscrepancy(batch: any, inputWeight: string): number | null {
    if (!inputWeight) return null;
    const intake = parseFloat(inputWeight);
    const declared = parseFloat(batch.declared_weight_kg);
    if (isNaN(intake) || isNaN(declared) || declared === 0) return null;
    return Math.abs(intake - declared) / declared;
  }

  async function handleConfirmIntake(batch: any) {
    const weight = intakeWeight[batch.id];
    if (!weight) return;

    // Pre-submission discrepancy warning
    const discrepancy = getWeightDiscrepancy(batch, weight);
    if (discrepancy !== null && discrepancy > 0.001) {
      const pct = (discrepancy * 100).toFixed(2);
      const confirmed = window.confirm(
        `Weight discrepancy of ${pct}% detected (declared: ${batch.declared_weight_kg} kg, intake: ${weight} kg).\n\nThis batch will be auto-flagged. Continue?`
      );
      if (!confirmed) return;
    }

    setActionLoading(batch.id);
    setActionError((prev) => { const n = { ...prev }; delete n[batch.id]; return n; });
    setActionWarning((prev) => { const n = { ...prev }; delete n[batch.id]; return n; });

    try {
      const result = await intakeAction({
        batch_id: batch.id,
        intake_weight_kg: parseFloat(weight),
      });

      if (result.success) {
        setIntakeWeight((prev) => ({ ...prev, [batch.id]: "" }));
        if (result.weightWarning) {
          setActionWarning((prev) => ({ ...prev, [batch.id]: result.weightWarning! }));
        }
        await fetchBatches();
      } else {
        setActionError((prev) => ({ ...prev, [batch.id]: result.error }));
      }
    } catch {
      setActionError((prev) => ({ ...prev, [batch.id]: "Intake confirmation failed" }));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain refinery --intake --pending
      </div>

      <div className="terminal-panel">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ REFINERY.INTAKE.QUEUE ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            {batches.length} BATCHES
          </span>
        </div>
        <div className="relative z-[1] p-4 overflow-x-auto">
          <table className="w-full text-[10px] min-w-[700px]">
            <thead>
              <tr className="text-gc-green-dim border-b border-gc-border">
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">BATCH_ID</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">ORIGIN</th>
                <th className="text-right py-2 px-2 font-normal tracking-[1px]">DECLARED_KG</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">STATUS</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">INTAKE_KG</th>
                <th className="text-left py-2 px-2 font-normal tracking-[1px]">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch: any) => {
                const needsIntake = batch.status === "NODE_02_APPROVED";
                const statusColor =
                  batch.status === "CERTIFIED" ? "text-gc-green" :
                  batch.status === "NODE_03_CONFIRMED" ? "text-gc-green-mid" :
                  "text-gc-amber";

                // Live discrepancy indicator
                const discrepancy = getWeightDiscrepancy(batch, intakeWeight[batch.id] || "");
                const hasDiscrepancy = discrepancy !== null && discrepancy > 0.001;

                return (
                  <tr key={batch.id} className="border-b border-gc-border/30 hover:bg-gc-green/5 transition-all">
                    <td className="py-2 px-2 text-gc-green-mid font-mono">{batch.batch_id}</td>
                    <td className="py-2 px-2 text-gc-green-dim">{batch.operators?.name}</td>
                    <td className="py-2 px-2 text-gc-gold text-right font-mono">{batch.declared_weight_kg}</td>
                    <td className={`py-2 px-2 ${statusColor}`}>[{batch.status}]</td>
                    <td className="py-2 px-2">
                      {needsIntake && (
                        <div>
                          <input
                            type="number"
                            step="0.0001"
                            min="0.001"
                            value={intakeWeight[batch.id] || ""}
                            onChange={(e) => setIntakeWeight((prev) => ({ ...prev, [batch.id]: e.target.value }))}
                            placeholder={String(batch.declared_weight_kg)}
                            className={`w-24 bg-transparent border rounded-gc px-2 py-1 text-[10px] text-gc-gold font-mono outline-none caret-gc-green ${
                              hasDiscrepancy ? "border-gc-red focus:border-gc-red" : "border-gc-border focus:border-gc-green-dim"
                            }`}
                          />
                          {hasDiscrepancy && (
                            <div className="text-[8px] text-gc-red mt-0.5">
                              {(discrepancy! * 100).toFixed(2)}% discrepancy — will auto-flag
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {needsIntake && (
                        <div className="space-y-1">
                          <button
                            onClick={() => handleConfirmIntake(batch)}
                            disabled={actionLoading === batch.id || !intakeWeight[batch.id]}
                            className="text-[9px] text-gc-cyan border border-gc-cyan/30 px-2 py-1 rounded-gc hover:bg-gc-cyan/10 transition-all tracking-[0.5px] disabled:opacity-50"
                          >
                            {actionLoading === batch.id ? (
                              <span className="animate-blink">...</span>
                            ) : (
                              "CONFIRM INTAKE"
                            )}
                          </button>
                          {actionError[batch.id] && (
                            <div className="text-[8px] text-gc-red max-w-[140px] truncate" title={actionError[batch.id]}>
                              {actionError[batch.id]}
                            </div>
                          )}
                          {actionWarning[batch.id] && (
                            <div className="text-[8px] text-gc-amber max-w-[140px]" title={actionWarning[batch.id]}>
                              {actionWarning[batch.id]}
                            </div>
                          )}
                        </div>
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
