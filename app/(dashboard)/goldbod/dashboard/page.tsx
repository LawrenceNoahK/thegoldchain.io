"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { approveAction } from "@/lib/actions/approvals";
import { flagReviewAction } from "@/lib/actions/flag-review";
import { certifyAction } from "@/lib/certificates";
import { satelliteVerifyAction } from "@/lib/actions/satellite-verify";
import { TerminalPanel } from "@/components/TerminalPanel";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge, SatBadge } from "@/components/StatusBadge";
import { ChainProgress } from "@/components/ChainProgress";
import { BatchTable, type Column } from "@/components/BatchTable";
import { BatchDetailPanel } from "@/components/BatchDetailPanel";
import { useRouter } from "next/navigation";

export default function GoldbodDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<"OVERRIDE" | "REJECT" | "ESCALATE" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Auth guard: verify user has goldbod_officer or admin role
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["goldbod_officer", "admin"].includes(profile.role)) {
        router.push("/login");
        return;
      }
      setAuthChecked(true);
    }
    checkAuth();
  }, [supabase, router]);

  const fetchBatches = useCallback(async () => {
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
  }, [supabase]);

  // Fetch + Realtime subscription
  useEffect(() => {
    if (!authChecked) return;

    let mounted = true;

    const safeFetch = async () => {
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
      if (mounted) setBatches(data || []);
    };

    safeFetch();

    const channel = supabase
      .channel("goldbod-batches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gold_batches" },
        () => { if (mounted) safeFetch(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "batch_nodes" },
        () => { if (mounted) safeFetch(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "satellite_checks" },
        () => { if (mounted) safeFetch(); }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, authChecked]);

  async function handleApprove(batch: any) {
    setActionLoading((prev) => new Set(prev).add(batch.id));
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
      setActionLoading((prev) => { const next = new Set(prev); next.delete(batch.id); return next; });
    }
  }

  async function handleSatVerify(batch: any) {
    setActionLoading((prev) => new Set(prev).add(batch.id));
    setActionError((prev) => {
      const next = { ...prev };
      delete next[batch.id];
      return next;
    });

    try {
      const result = await satelliteVerifyAction({ batch_id: batch.id });
      if (result.success) {
        await fetchBatches();
      } else {
        setActionError((prev) => ({ ...prev, [batch.id]: result.error }));
      }
    } catch {
      setActionError((prev) => ({ ...prev, [batch.id]: "Satellite verification failed" }));
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(batch.id); return next; });
    }
  }

  async function handleCertify(batch: any) {
    setActionLoading((prev) => new Set(prev).add(batch.id));
    setActionError((prev) => {
      const next = { ...prev };
      delete next[batch.id];
      return next;
    });

    try {
      const result = await certifyAction({ batch_id: batch.id });
      if (result.success) {
        await fetchBatches();
      } else {
        setActionError((prev) => ({ ...prev, [batch.id]: result.error }));
      }
    } catch {
      setActionError((prev) => ({ ...prev, [batch.id]: "Certification failed" }));
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(batch.id); return next; });
    }
  }

  async function handleFlagReview() {
    if (!selectedBatch || !reviewAction) return;

    const batchId = selectedBatch.id;
    setActionLoading((prev) => new Set(prev).add(batchId));
    setActionError((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });

    try {
      const result = await flagReviewAction({
        batch_id: batchId,
        action: reviewAction,
        officer_notes: reviewNotes,
      });

      if (result.success) {
        setSelectedBatch(null);
        setReviewAction(null);
        setReviewNotes("");
        await fetchBatches();
      } else {
        setActionError((prev) => ({
          ...prev,
          [batchId]: result.error + (result.fieldErrors ? ` (${Object.values(result.fieldErrors).flat().join(", ")})` : ""),
        }));
      }
    } catch {
      setActionError((prev) => ({ ...prev, [batchId]: "Flag review request failed" }));
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(batchId); return next; });
    }
  }

  if (!authChecked) return null;

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
      render: (b) => <SatBadge status={b.satellite_checks?.overall_status || "\u2014"} />,
    },
    {
      key: "action",
      label: "ACTION",
      render: (batch) => {
        const satStatus = batch.satellite_checks?.overall_status || "\u2014";
        return (
          <>
            {batch.status === "PENDING" && satStatus === "\u2014" && (
              <div className="space-y-1">
                <button
                  onClick={() => handleSatVerify(batch)}
                  disabled={actionLoading.has(batch.id)}
                  className="text-[9px] text-[#00FFD1] border border-[#00FFD1]/30 px-2 py-1 rounded-gc hover:bg-[#00FFD1]/10 transition-all tracking-[0.5px] disabled:opacity-50"
                >
                  {actionLoading.has(batch.id) ? (
                    <span className="animate-blink">...</span>
                  ) : (
                    "SAT VERIFY"
                  )}
                </button>
                {actionError[batch.id] && (
                  <div className="text-[8px] text-gc-red max-w-[120px] truncate" title={actionError[batch.id]}>
                    {actionError[batch.id]}
                  </div>
                )}
              </div>
            )}
            {batch.status === "PENDING" && satStatus === "PASS" && (
              <div className="space-y-1">
                <button
                  onClick={() => handleApprove(batch)}
                  disabled={actionLoading.has(batch.id)}
                  className="text-[9px] text-gc-green border border-gc-green/30 px-2 py-1 rounded-gc hover:bg-gc-green/10 transition-all tracking-[0.5px] disabled:opacity-50"
                >
                  {actionLoading.has(batch.id) ? (
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
              <button
                onClick={() => setSelectedBatch(batch)}
                className="text-[9px] text-gc-red border border-gc-red/30 px-2 py-1 rounded-gc hover:bg-gc-red/10 transition-all tracking-[0.5px]"
              >
                REVIEW
              </button>
            )}
            {batch.status === "NODE_03_CONFIRMED" && (
              <div className="space-y-1">
                <button
                  onClick={() => handleCertify(batch)}
                  disabled={actionLoading.has(batch.id)}
                  className="text-[9px] text-gc-gold border border-gc-gold/30 px-2 py-1 rounded-gc hover:bg-gc-gold/10 transition-all tracking-[0.5px] disabled:opacity-50"
                >
                  {actionLoading.has(batch.id) ? (
                    <span className="animate-blink">...</span>
                  ) : (
                    "CERTIFY"
                  )}
                </button>
                {actionError[batch.id] && (
                  <div className="text-[8px] text-gc-red max-w-[120px] truncate" title={actionError[batch.id]}>
                    {actionError[batch.id]}
                  </div>
                )}
              </div>
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

      {/* FLAG Review Detail Panel */}
      {selectedBatch && (
        <BatchDetailPanel
          batch={selectedBatch}
          onClose={() => {
            setSelectedBatch(null);
            setReviewAction(null);
            setReviewNotes("");
          }}
          actions={
            <div className="space-y-3">
              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {(["OVERRIDE", "REJECT", "ESCALATE"] as const).map((action) => {
                  const colors: Record<string, string> = {
                    OVERRIDE: "border-gc-amber/40 text-gc-amber hover:bg-gc-amber/10",
                    REJECT: "border-gc-red/40 text-gc-red hover:bg-gc-red/10",
                    ESCALATE: "border-gc-green/40 text-gc-green-dim hover:bg-gc-green/10",
                  };
                  return (
                    <button
                      key={action}
                      onClick={() => setReviewAction(action)}
                      className={`text-[9px] px-3 py-1.5 rounded-gc border tracking-[0.5px] transition-all ${
                        reviewAction === action
                          ? `${colors[action]} bg-opacity-20 ring-1 ring-current`
                          : `${colors[action]} opacity-60`
                      }`}
                    >
                      {action}
                    </button>
                  );
                })}
              </div>

              {/* Notes textarea */}
              {reviewAction && (
                <>
                  <div>
                    <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
                      OFFICER_NOTES (min 10 chars)
                    </label>
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Explain your decision..."
                      rows={3}
                      className="w-full bg-gc-bg border border-gc-border rounded-gc p-2 text-[10px] text-gc-green font-mono placeholder:text-gc-green-muted/40 focus:outline-none focus:border-gc-green/40 resize-none"
                    />
                    <div className="text-[8px] text-gc-green-muted mt-0.5">
                      {reviewNotes.length}/1000
                    </div>
                  </div>

                  <button
                    onClick={handleFlagReview}
                    disabled={actionLoading.has(selectedBatch.id) || reviewNotes.length < 10}
                    className={`text-[9px] px-4 py-1.5 rounded-gc border tracking-[0.5px] transition-all disabled:opacity-30 ${
                      reviewAction === "REJECT"
                        ? "border-gc-red/40 text-gc-red hover:bg-gc-red/10"
                        : reviewAction === "OVERRIDE"
                        ? "border-gc-amber/40 text-gc-amber hover:bg-gc-amber/10"
                        : "border-gc-green/40 text-gc-green-dim hover:bg-gc-green/10"
                    }`}
                  >
                    {actionLoading.has(selectedBatch.id) ? (
                      <span className="animate-blink">PROCESSING...</span>
                    ) : (
                      `CONFIRM ${reviewAction}`
                    )}
                  </button>
                </>
              )}

              {/* Error display */}
              {actionError[selectedBatch.id] && (
                <div className="text-[9px] text-gc-red border border-gc-red/20 bg-gc-red/5 rounded-gc p-2">
                  {actionError[selectedBatch.id]}
                </div>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
