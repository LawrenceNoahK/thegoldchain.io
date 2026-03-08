"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { approveAction } from "@/lib/actions/approvals";
import { TerminalPanel } from "@/components/TerminalPanel";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge, SatBadge } from "@/components/StatusBadge";
import { ChainProgress } from "@/components/ChainProgress";
import { BatchTable, type Column } from "@/components/BatchTable";

export default function GoldbodDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const fetchBatches = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchBatches();

    const supabase = createClient();
    const channel = supabase
      .channel("goldbod-batches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gold_batches" },
        () => { fetchBatches(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "batch_nodes" },
        () => { fetchBatches(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "satellite_checks" },
        () => { fetchBatches(); }
      )
      .subscribe();

    return () => {
      channel.unsubscribe().then(() => {
        supabase.removeChannel(channel);
      });
    };
  }, [fetchBatches]);

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

  const columns: Column<any>[] = [
    {
      key: "batch_id",
      label: "BATCH_ID",
      render: (b) => <span className="text-gc-green-mid font-mono">{b.batch_id}</span>,
    },
    {
      key: "operator",
      label: "OPERATOR",
      render: (b) => <span className="text-gc-green-dim">{b.operators?.name}</span>,
    },
    {
      key: "region",
      label: "REGION",
      render: (b) => <span className="text-gc-green-muted">{b.operators?.region}</span>,
    },
    {
      key: "weight",
      label: "WEIGHT_KG",
      align: "right" as const,
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
      label: "SAT",
      render: (b) => <SatBadge status={b.satellite_checks?.[0]?.overall_status || "\u2014"} />,
    },
    {
      key: "action",
      label: "ACTION",
      render: (batch) => {
        const satStatus = batch.satellite_checks?.[0]?.overall_status || "\u2014";
        return (
          <>
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
          </>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain goldbod --dashboard --all-batches --realtime
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="PENDING_REVIEW" value={pending.length} color="text-gc-amber" />
        <MetricCard label="APPROVED" value={approved.length} color="text-gc-green" />
        <MetricCard label="FLAGGED" value={flagged.length} color="text-gc-red" />
        <MetricCard label="CERTIFIED" value={certified.length} color="text-gc-green glow-text" />
      </div>

      <div className="flex items-center gap-2 text-[8px] text-gc-green-dim tracking-[1px]">
        <span className="text-gc-green animate-blink">{"\u25CF"}</span>
        REALTIME CONNECTED
      </div>

      <TerminalPanel title="ALL.BATCHES.LIVE" subtitle={`${batches.length} TOTAL`}>
        <div className="p-4 overflow-x-auto">
          <BatchTable
            columns={columns}
            data={batches}
            rowKey={(b) => b.id}
            minWidth="700px"
          />
        </div>
      </TerminalPanel>
    </div>
  );
}
