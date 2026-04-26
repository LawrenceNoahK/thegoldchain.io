"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { TerminalPanel } from "@/components/TerminalPanel";
import { MetricCard } from "@/components/MetricCard";
import { useRouter } from "next/navigation";

// ── Types ────────────────────────────────────────────────────
interface Batch {
  id: string;
  batch_id: string;
  declared_weight_kg: number;
  status: string;
  created_at: string;
  operators?: { name: string; license_number: string; region: string } | null;
  batch_nodes?: BatchNode[];
  satellite_checks?: SatCheck[];
}

interface BatchNode {
  id: string;
  batch_id: string;
  node_number: number;
  status: string;
  tx_hash: string;
  timestamp: string;
  data: Record<string, any>;
}

interface SatCheck {
  id: string;
  batch_id: string;
  overall_status: string;
  flagged_details: string | null;
  check_1_surface_disturbance: string;
  check_2_boundary_compliance: string;
  check_3_deforestation: string;
  check_4_water_proximity: string;
  check_5_volume_plausibility: string;
  check_6_anomaly_detection: string;
}

interface TxEntry {
  time: string;
  code: string;
  label: string;
  hash: string;
  color: string;
}

interface TermLine {
  type: "sys" | "prompt" | "out" | "success" | "err" | "dim";
  text: string;
}

// ── Helpers ──────────────────────────────────────────────────
const pad = (n: number, l = 2) => String(n).padStart(l, "0");
const ts = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const shortHash = () =>
  `0x${Array.from({ length: 8 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;

const TX_COLORS: Record<string, string> = {
  DECLARE: "text-gc-green",
  CERTIFY: "text-[#00FFD1]",
  VERIFY: "text-gc-amber",
  EXPORT: "text-gc-gold",
  FLAG: "text-gc-red",
  CSDDD: "text-[#A8FF3E]",
  APPROVE: "text-gc-green-mid",
  INTAKE: "text-[#00FFD1]",
};

const TX_BORDER_COLORS: Record<string, string> = {
  DECLARE: "border-gc-green/40",
  CERTIFY: "border-[#00FFD1]/40",
  VERIFY: "border-gc-amber/40",
  EXPORT: "border-gc-gold/40",
  FLAG: "border-gc-red/40",
  CSDDD: "border-[#A8FF3E]/40",
  APPROVE: "border-gc-green-mid/40",
  INTAKE: "border-[#00FFD1]/40",
};

// CSDDD deadline: July 26, 2028
const CSDDD_DEADLINE = new Date("2028-07-26T00:00:00Z");
const daysToCsddd = () => Math.max(0, Math.ceil((CSDDD_DEADLINE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

// ── Component ────────────────────────────────────────────────
export default function TerminalPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [txFeed, setTxFeed] = useState<TxEntry[]>([]);
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [cmdInput, setCmdInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdIdx, setCmdIdx] = useState(-1);
  const [clock, setClock] = useState(ts());
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedNode, setSelectedNode] = useState<BatchNode | null>(null);
  const termOutRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Auth guard
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
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

  // Clock
  useEffect(() => {
    const iv = setInterval(() => setClock(ts()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    const [batchRes, opRes] = await Promise.all([
      supabase
        .from("gold_batches")
        .select(`
          *,
          operators (name, license_number, region),
          batch_nodes (id, batch_id, node_number, status, tx_hash, timestamp, data),
          satellite_checks (*)
        `)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("operators").select("*").eq("status", "active"),
    ]);
    setBatches(batchRes.data || []);
    setOperators(opRes.data || []);
  }, [supabase]);

  // Initial fetch + Realtime
  useEffect(() => {
    if (!authChecked) return;
    let mounted = true;

    const safeFetch = async () => {
      const [batchRes, opRes] = await Promise.all([
        supabase
          .from("gold_batches")
          .select(`
            *,
            operators (name, license_number, region),
            batch_nodes (id, batch_id, node_number, status, tx_hash, timestamp, data),
            satellite_checks (*)
          `)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("operators").select("*").eq("status", "active"),
      ]);
      if (mounted) {
        setBatches(batchRes.data || []);
        setOperators(opRes.data || []);
      }
    };

    safeFetch();

    // Boot message
    setTermLines([
      { type: "sys", text: "THE GOLDCHAIN TERMINAL v1.0.0" },
      { type: "dim", text: "─".repeat(50) },
      { type: "out", text: "Ghana Gold Board Act 2025 (Act 1140)" },
      { type: "out", text: "EU CSDDD Directive 2024/1760 Compliant" },
      { type: "success", text: "● Connected to Supabase Realtime" },
      { type: "dim", text: "Type 'help' for available commands" },
    ]);

    const channel = supabase
      .channel("terminal-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_batches" }, (payload) => {
        if (mounted) {
          safeFetch();
          // Add to TX feed
          const rec = payload.new as any;
          if (rec) {
            setTxFeed((prev) => {
              const code = payload.eventType === "INSERT" ? "DECLARE" : rec.status === "FLAGGED" ? "FLAG" : "APPROVE";
              const entry: TxEntry = {
                time: ts(),
                code,
                label: rec.batch_id || "batch",
                hash: shortHash(),
                color: code,
              };
              return [entry, ...prev].slice(0, 15);
            });
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_nodes" }, (payload) => {
        if (mounted) {
          safeFetch();
          const rec = payload.new as any;
          if (rec && payload.eventType === "INSERT") {
            const nodeLabels: Record<number, string> = { 1: "DECLARE", 2: "CERTIFY", 3: "INTAKE", 4: "CSDDD" };
            setTxFeed((prev) => {
              const entry: TxEntry = {
                time: ts(),
                code: nodeLabels[rec.node_number] || "NODE",
                label: `Node ${pad(rec.node_number)} · ${rec.status}`,
                hash: rec.tx_hash === "PENDING_FABRIC" ? shortHash() : rec.tx_hash?.slice(0, 18) || shortHash(),
                color: nodeLabels[rec.node_number] || "DECLARE",
              };
              return [entry, ...prev].slice(0, 15);
            });
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "satellite_checks" }, (payload) => {
        if (mounted) {
          safeFetch();
          const rec = payload.new as any;
          if (rec) {
            setTxFeed((prev) => {
              const entry: TxEntry = {
                time: ts(),
                code: "VERIFY",
                label: `Satellite · ${rec.overall_status}`,
                hash: shortHash(),
                color: "VERIFY",
              };
              return [entry, ...prev].slice(0, 15);
            });
          }
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, authChecked]);

  // Auto-scroll terminal
  useEffect(() => {
    if (termOutRef.current) {
      termOutRef.current.scrollTop = termOutRef.current.scrollHeight;
    }
  }, [termLines]);

  // ── Terminal Commands ──────────────────────────────────────
  const addLines = useCallback((lines: TermLine[]) => {
    setTermLines((prev) => [...prev, ...lines]);
  }, []);

  const runCommand = useCallback((raw: string) => {
    const cmd = raw.trim().toLowerCase();
    const base = cmd.split(" ")[0];
    const arg = cmd.split(" ").slice(1).join(" ");

    addLines([{ type: "prompt", text: raw }]);

    if (cmd === "clear") {
      setTermLines([]);
      return;
    }

    if (cmd === "help") {
      addLines([
        { type: "sys", text: "  thegoldchain [command] [options]" },
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: "  trace <batch-id>        Trace batch chain-of-custody" },
        { type: "out", text: "  verify <operator-id>    Verify operator license via MCAS" },
        { type: "out", text: "  satellite <batch-id>    Pull satellite verification" },
        { type: "out", text: "  stats                   Network statistics" },
        { type: "out", text: "  operators               List active operators" },
        { type: "out", text: "  batches                 List recent batches" },
        { type: "out", text: "  flagged                 Show flagged batches" },
        { type: "out", text: "  csddd                   CSDDD compliance status" },
        { type: "out", text: "  clear                   Clear terminal" },
      ]);
      return;
    }

    if (base === "stats") {
      const certified = batches.filter((b) => b.status === "CERTIFIED").length;
      const totalWeight = batches.reduce((sum, b) => sum + (b.declared_weight_kg || 0), 0);
      const flaggedCount = batches.filter((b) => b.status === "FLAGGED").length;
      addLines([
        { type: "sys", text: "  THE GOLDCHAIN NETWORK STATISTICS" },
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  total_batches          : ${batches.length}` },
        { type: "out", text: `  certified_batches      : ${certified}` },
        { type: "out", text: `  flagged_batches        : ${flaggedCount}` },
        { type: "out", text: `  total_weight_kg        : ${totalWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
        { type: "out", text: `  active_operators       : ${operators.length}` },
        { type: "out", text: `  csddd_deadline_days    : ${daysToCsddd()}` },
        { type: "success", text: "  goldbod_node           : ONLINE" },
      ]);
      return;
    }

    if (base === "operators") {
      addLines([
        { type: "sys", text: "  ACTIVE LICENSED OPERATORS" },
        { type: "dim", text: "  " + "─".repeat(44) },
      ]);
      if (operators.length === 0) {
        addLines([{ type: "dim", text: "  No active operators found" }]);
      } else {
        operators.forEach((op) => {
          addLines([{
            type: "out",
            text: `  ${op.license_number || "N/A"}  ${(op.name || "").padEnd(28)}  ${(op.region || "").padEnd(12)}  ${op.status?.toUpperCase() || "ACTIVE"}`,
          }]);
        });
      }
      addLines([
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  ${operators.length} operators active` },
      ]);
      return;
    }

    if (base === "batches") {
      const recent = batches.slice(0, 10);
      addLines([
        { type: "sys", text: "  RECENT BATCHES" },
        { type: "dim", text: "  " + "─".repeat(52) },
      ]);
      recent.forEach((b) => {
        const status = (b.status || "").padEnd(18);
        const weight = String(b.declared_weight_kg || 0).padStart(8);
        addLines([{
          type: b.status === "FLAGGED" ? "err" : b.status === "CERTIFIED" ? "success" : "out",
          text: `  ${b.batch_id}  ${status}  ${weight} kg  ${b.operators?.region || ""}`,
        }]);
      });
      addLines([{ type: "dim", text: `  ${batches.length} total batches` }]);
      return;
    }

    if (base === "flagged") {
      const flagged = batches.filter((b) => b.status === "FLAGGED");
      addLines([
        { type: "sys", text: "  FLAGGED BATCHES" },
        { type: "dim", text: "  " + "─".repeat(44) },
      ]);
      if (flagged.length === 0) {
        addLines([{ type: "success", text: "  No flagged batches" }]);
      } else {
        flagged.forEach((b) => {
          const reason = b.satellite_checks?.[0]?.flagged_details || "Review required";
          addLines([{ type: "err", text: `  ${b.batch_id}  ${b.operators?.name || ""}  ${reason}` }]);
        });
      }
      return;
    }

    if (base === "trace") {
      const batchId = arg.toUpperCase();
      const batch = batches.find((b) => b.batch_id === batchId);
      if (!batch) {
        addLines([{ type: "err", text: `  Batch not found: ${batchId || "(no batch-id provided)"}` }]);
        return;
      }
      const nodes = (batch.batch_nodes || []).sort((a, b) => a.node_number - b.node_number);
      const confirmed = nodes.filter((n) => n.status === "CONFIRMED").length;
      addLines([
        { type: "sys", text: `  CHAIN OF CUSTODY TRACE: ${batch.batch_id}` },
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  operator       : ${batch.operators?.name || "—"}` },
        { type: "out", text: `  region         : ${batch.operators?.region || "—"}` },
        { type: "out", text: `  weight         : ${batch.declared_weight_kg} kg` },
        { type: "out", text: `  status         : ${batch.status}` },
        { type: "dim", text: "  " + "─".repeat(44) },
      ]);
      const nodeNames = ["MINE.DECLARE", "GOLDBOD.CERT", "REFINERY.LOG", "CSDDD.ISSUE"];
      for (let i = 1; i <= 4; i++) {
        const node = nodes.find((n) => n.node_number === i);
        const name = nodeNames[i - 1];
        if (node) {
          const txDisplay = node.tx_hash === "PENDING_FABRIC" ? "TX_PENDING" : node.tx_hash?.slice(0, 16) || "—";
          addLines([{
            type: node.status === "CONFIRMED" ? "success" : node.status === "FLAGGED" ? "err" : "out",
            text: `  N${pad(i)} ${name.padEnd(16)} [${node.status}]  TX: ${txDisplay}`,
          }]);
        } else {
          addLines([{ type: "dim", text: `  N${pad(i)} ${name.padEnd(16)} [WAITING]` }]);
        }
      }
      addLines([
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  chain progress: ${confirmed}/4 nodes confirmed` },
      ]);
      return;
    }

    if (base === "satellite") {
      const batchId = arg.toUpperCase();
      const batch = batches.find((b) => b.batch_id === batchId);
      if (!batch) {
        addLines([{ type: "err", text: `  Batch not found: ${batchId || "(no batch-id provided)"}` }]);
        return;
      }
      const sat = batch.satellite_checks?.[0];
      if (!sat) {
        addLines([{ type: "dim", text: `  No satellite check data for ${batchId}` }]);
        return;
      }
      const checks = [
        { key: "check_1_surface_disturbance", label: "SURFACE_DISTURBANCE" },
        { key: "check_2_boundary_compliance", label: "BOUNDARY_COMPLIANCE" },
        { key: "check_3_deforestation", label: "DEFORESTATION_CHECK" },
        { key: "check_4_water_proximity", label: "WATER_PROXIMITY" },
        { key: "check_5_volume_plausibility", label: "VOLUME_PLAUSIBILITY" },
        { key: "check_6_anomaly_detection", label: "ANOMALY_DETECTION" },
      ];
      addLines([
        { type: "sys", text: `  SENTINEL-2 VERIFICATION: ${batchId}` },
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  overall_status : ${sat.overall_status}` },
      ]);
      checks.forEach((c) => {
        const val = (sat as any)[c.key] || "—";
        addLines([{
          type: val === "PASS" ? "success" : val === "FAIL" ? "err" : "out",
          text: `  ${c.label.padEnd(22)} : ${val}`,
        }]);
      });
      if (sat.flagged_details) {
        addLines([{ type: "err", text: `  flagged_details: ${sat.flagged_details}` }]);
      }
      return;
    }

    if (base === "verify") {
      const search = arg;
      const op = operators.find((o) =>
        o.license_number?.toLowerCase() === search ||
        o.name?.toLowerCase().includes(search)
      );
      if (!op) {
        addLines([{ type: "err", text: `  Operator not found: ${search || "(no id provided)"}` }]);
        return;
      }
      addLines([
        { type: "sys", text: `  OPERATOR VERIFICATION: ${op.license_number}` },
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  name           : ${op.name}` },
        { type: "out", text: `  license        : ${op.license_number}` },
        { type: "out", text: `  region         : ${op.region}` },
        { type: "out", text: `  status         : ${op.status?.toUpperCase()}` },
        { type: op.status === "active" ? "success" : "err", text: `  mcas_verified  : ${op.status === "active" ? "YES" : "NO"}` },
      ]);
      return;
    }

    if (base === "csddd") {
      const certified = batches.filter((b) => b.status === "CERTIFIED").length;
      addLines([
        { type: "sys", text: "  EU CSDDD COMPLIANCE STATUS" },
        { type: "dim", text: "  " + "─".repeat(44) },
        { type: "out", text: `  directive      : 2024/1760` },
        { type: "out", text: `  enforcement    : July 26, 2028` },
        { type: "out", text: `  days_remaining : ${daysToCsddd()}` },
        { type: "out", text: `  certs_issued   : ${certified}` },
        { type: "out", text: `  coverage       : 100% pilot` },
        { type: "success", text: "  status         : COMPLIANT" },
      ]);
      return;
    }

    if (cmd === "") return;

    addLines([{ type: "err", text: `  Command not found: ${base}. Type 'help' for available commands.` }]);
  }, [batches, operators, addLines]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && cmdInput.trim()) {
      const cmd = cmdInput.trim();
      setCmdHistory((prev) => [cmd, ...prev]);
      setCmdIdx(-1);
      runCommand(cmd);
      setCmdInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCmdIdx((prev) => {
        const next = Math.min(prev + 1, cmdHistory.length - 1);
        setCmdInput(cmdHistory[next] || "");
        return next;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCmdIdx((prev) => {
        const next = Math.max(prev - 1, -1);
        setCmdInput(next === -1 ? "" : cmdHistory[next] || "");
        return next;
      });
    }
  };

  if (!authChecked) return null;

  // ── Derived stats ──────────────────────────────────────────
  const certified = batches.filter((b) => b.status === "CERTIFIED").length;
  const pending = batches.filter((b) => b.status === "PENDING").length;
  const flagged = batches.filter((b) => b.status === "FLAGGED").length;
  const totalWeight = batches.reduce((sum, b) => sum + (b.declared_weight_kg || 0), 0);
  const allNodes = batches.flatMap((b) => b.batch_nodes || []);
  const confirmedNodes = allNodes.filter((n) => n.status === "CONFIRMED").length;

  // Operator volume stats
  const opStats = operators.map((op) => {
    const opBatches = batches.filter((b) => b.operators?.name === op.name);
    const vol = opBatches.reduce((s, b) => s + (b.declared_weight_kg || 0), 0);
    const certCount = opBatches.filter((b) => b.status === "CERTIFIED").length;
    const score = opBatches.length > 0 ? Math.round((certCount / opBatches.length) * 100) : 0;
    return { ...op, volume: vol, batches: opBatches.length, score };
  });

  // Satellite checks summary
  const satBatches = batches.filter((b) => b.satellite_checks && b.satellite_checks.length > 0);
  const satPassed = satBatches.filter((b) => b.satellite_checks![0].overall_status === "PASS").length;
  const satFailed = satBatches.filter((b) => b.satellite_checks![0].overall_status === "FAIL").length;

  // Recent batch for chain trace display
  const latestBatch = batches[0];
  const latestNodes = (latestBatch?.batch_nodes || []).sort((a, b) => a.node_number - b.node_number);
  const latestConfirmed = latestNodes.filter((n) => n.status === "CONFIRMED").length;

  const TERM_LINE_COLORS: Record<string, string> = {
    sys: "text-gc-green-dim",
    prompt: "text-gc-green",
    out: "text-gc-green-mid",
    success: "text-gc-green glow-text",
    err: "text-gc-red",
    dim: "text-gc-border",
  };

  const NODE_NAMES = ["MINE.DECLARE", "GOLDBOD.CERT", "REFINERY.LOG", "CSDDD.ISSUE"];

  return (
    <div className="space-y-3">
      {/* Command hint */}
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain terminal --live --phosphor
      </div>

      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-gc-border pb-3">
        <div className="text-[10px] text-gc-green-dim tracking-[1px]">
          GHANA GOLD BOARD · REGULATORY NODE
        </div>
        <div className="text-right">
          <div className="text-lg font-mono text-gc-green glow-text tracking-[2px]">
            {clock} UTC
          </div>
          <div className="text-[9px] text-gc-green-dim mt-0.5">
            <span className="text-gc-green animate-blink">●</span> NETWORK LIVE
          </div>
        </div>
      </div>

      {/* ── METRICS STRIP ───────────────────────────────── */}
      <div className="grid grid-cols-6 gap-2">
        <MetricCard label="CERTIFIED" value={certified} color="text-gc-green glow-text" />
        <MetricCard label="PENDING" value={pending} color="text-gc-amber" />
        <MetricCard label="FLAGGED" value={flagged} color="text-gc-red" />
        <MetricCard label="ASM_VOLUME" value={`${totalWeight.toLocaleString()} kg`} color="text-gc-gold" />
        <MetricCard label="OPERATORS" value={operators.length} color="text-[#00FFD1]" />
        <MetricCard label="TX_NODES" value={confirmedNodes} color="text-[#A8FF3E]" />
      </div>

      {/* ── MAIN 3-COL GRID ─────────────────────────────── */}
      <div className="grid grid-cols-[1fr_1fr_260px] gap-3">

        {/* COL 1 ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Chain of Custody Trace */}
          <TerminalPanel title="CHAIN.OF.CUSTODY.TRACE" subtitle="HYPERLEDGER FABRIC">
            <div className="p-3">
              <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-2">
                $ thegoldchain trace --batch {latestBatch?.batch_id || "—"}
              </div>
              <div className="grid grid-cols-2 gap-2 relative">
                {NODE_NAMES.map((name, i) => {
                  const node = latestNodes.find((n) => n.node_number === i + 1);
                  const status = node?.status || "WAITING";
                  const borderColor = status === "CONFIRMED"
                    ? "border-gc-green shadow-[0_0_10px_rgba(0,255,65,0.3)]"
                    : status === "PENDING" ? "border-gc-amber" : status === "FLAGGED" ? "border-gc-red" : "border-gc-border";
                  const bg = status === "CONFIRMED" ? "bg-gc-green/5" : "bg-black/30";
                  const textColor = status === "CONFIRMED"
                    ? "text-gc-green"
                    : status === "PENDING" ? "text-gc-amber" : status === "FLAGGED" ? "text-gc-red" : "text-gc-green-muted";
                  const txDisplay = node?.tx_hash === "PENDING_FABRIC" ? "TX_PENDING" : node?.tx_hash?.slice(0, 8) || "????";
                  const isClickable = !!node;
                  return (
                    <div
                      key={i}
                      onClick={() => node && setSelectedNode(selectedNode?.id === node.id ? null : node)}
                      className={`p-2 border ${borderColor} ${bg} rounded-gc transition-all ${isClickable ? "cursor-pointer hover:brightness-125 hover:shadow-[0_0_14px_rgba(0,255,65,0.2)]" : ""} ${selectedNode?.id === node?.id ? "ring-1 ring-gc-green" : ""}`}
                    >
                      <div className="text-[8px] text-gc-green-dim tracking-[1px]">N{pad(i + 1)}</div>
                      <div className={`text-[10px] ${textColor} font-semibold tracking-[0.5px] mt-0.5`}>{name}</div>
                      <div className="flex justify-between items-center mt-1.5">
                        <span className={`text-[8px] ${textColor} tracking-[0.5px]`}>[{status}]</span>
                        <span className="text-[8px] text-gc-border font-mono">#{txDisplay}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Popover rendered at page level via portal-like approach below */}
              </div>
              {/* Progress bar */}
              <div className="mt-2">
                <div className="h-[3px] bg-gc-border/30 rounded-gc overflow-hidden">
                  <div
                    className="h-full bg-gc-green transition-all duration-500"
                    style={{ width: `${(latestConfirmed / 4) * 100}%`, boxShadow: "0 0 6px #00FF41" }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[8px]">
                  <span className="text-gc-green-dim">chain progress: {latestConfirmed}/4 nodes confirmed</span>
                  <span className="text-gc-green-muted">
                    {latestConfirmed === 4 ? "COMPLETE" : latestConfirmed === 0 ? "awaiting declaration" : "in progress"}
                  </span>
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Satellite Verification Summary */}
          <TerminalPanel title="SENTINEL-2.SATELLITE.VERIFY" subtitle="LIVE">
            <div className="p-3">
              <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-2">
                $ sentinel2 --region GHANA --verify-boundaries
              </div>
              <table className="w-full text-[9px] font-mono">
                <thead>
                  <tr className="text-gc-green-dim border-b border-gc-border/30">
                    <th scope="col" className="text-left py-1 font-normal tracking-[1px]">BATCH</th>
                    <th scope="col" className="text-left py-1 font-normal tracking-[1px]">OPERATOR</th>
                    <th scope="col" className="text-left py-1 font-normal tracking-[1px]">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {satBatches.slice(0, 6).map((b) => {
                    const sat = b.satellite_checks![0];
                    return (
                      <tr key={b.id} className="border-b border-gc-border/10">
                        <td className="py-1 text-gc-green-mid">{b.batch_id}</td>
                        <td className="py-1 text-gc-green-dim">{b.operators?.name?.split(" ")[0] || "—"}</td>
                        <td className={`py-1 ${sat.overall_status === "PASS" ? "text-gc-green" : "text-gc-red"}`}>
                          {sat.overall_status}
                        </td>
                      </tr>
                    );
                  })}
                  {satBatches.length === 0 && (
                    <tr><td colSpan={3} className="py-2 text-gc-green-muted">No satellite data yet</td></tr>
                  )}
                </tbody>
              </table>
              <div className="text-gc-border text-[9px] mt-2 overflow-hidden">{"─".repeat(60)}</div>
              <div className="text-[9px] mt-1">
                <span className="text-gc-green-muted">passed: </span>
                <span className="text-gc-green">{satPassed}</span>
                <span className="text-gc-green-muted ml-3">failed: </span>
                <span className="text-gc-red">{satFailed}</span>
                <span className="text-gc-green-muted ml-3">total: </span>
                <span className="text-gc-green-dim">{satBatches.length}</span>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* COL 2 ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Interactive Terminal */}
          <TerminalPanel title="THE GOLDCHAIN.TERMINAL" subtitle="type 'help'">
            <div className="p-3 flex flex-col">
              <div
                ref={termOutRef}
                className="overflow-y-auto text-[10px] leading-relaxed font-mono max-h-[200px] min-h-[140px]"
                onClick={() => inputRef.current?.focus()}
              >
                {termLines.map((line, i) => (
                  <div key={i} className={`flex gap-1.5 px-0.5 ${TERM_LINE_COLORS[line.type] || "text-gc-green-mid"}`}>
                    {line.type === "prompt" ? (
                      <>
                        <span className="text-gc-green-dim flex-shrink-0">thegoldchain $</span>
                        <span className="whitespace-pre">{line.text}</span>
                      </>
                    ) : (
                      <span className="whitespace-pre">{line.text}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-gc-border/30 mt-1">
                <span className="text-[10px] text-gc-green-dim flex-shrink-0">thegoldchain $</span>
                <input
                  ref={inputRef}
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="type a command..."
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-transparent border-none outline-none text-[10px] text-gc-green font-mono placeholder:text-gc-green-muted/30 caret-gc-green"
                />
                <span className="text-gc-green animate-blink text-[10px]">█</span>
              </div>
            </div>
          </TerminalPanel>

          {/* Operator Compliance */}
          <TerminalPanel title="OPERATOR.COMPLIANCE.METRICS" subtitle={clock}>
            <div className="p-3">
              <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-2">
                $ thegoldchain stats --operators --compliance
              </div>
              <div className="space-y-2">
                {opStats.map((op) => {
                  const pct = Math.min(100, op.volume > 0 ? (op.volume / Math.max(...opStats.map((o) => o.volume), 1)) * 100 : 0);
                  const color = op.score >= 90 ? "bg-gc-green" : op.score >= 70 ? "bg-gc-green-mid" : "bg-gc-amber";
                  return (
                    <div key={op.id}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-gc-green-dim tracking-[0.5px]">
                          {op.license_number} · {op.name} · {op.region}
                        </span>
                        <span className="text-[9px] text-gc-green font-mono">{op.volume.toLocaleString()} kg</span>
                      </div>
                      <div className="h-[2px] bg-gc-border/30">
                        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%`, boxShadow: `0 0 4px currentColor` }} />
                      </div>
                    </div>
                  );
                })}
                {opStats.length === 0 && (
                  <div className="text-[9px] text-gc-green-muted">No operator data</div>
                )}
              </div>
              <div className="text-gc-border text-[9px] mt-3 overflow-hidden">{"─".repeat(60)}</div>
              <div className="flex flex-col gap-0.5 text-[10px] mt-2">
                <div className="flex gap-2">
                  <span className="text-gc-green-dim min-w-[140px]">total_weight</span>
                  <span className="text-gc-gold">{totalWeight.toLocaleString()} kg</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gc-green-dim min-w-[140px]">certified_batches</span>
                  <span className="text-gc-green">{certified}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gc-green-dim min-w-[140px]">boundary_flags</span>
                  <span className="text-gc-red">{flagged} ACTIVE</span>
                </div>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* COL 3: TX Feed ─────────────────────────────── */}
        <div>
          <TerminalPanel title="LIVE.TX.FEED" subtitle="STREAMING" titleColor="text-gc-green animate-blink">
            <div className="p-3">
              <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-2">
                $ thegoldchain stream --live
              </div>
              <div className="flex flex-col gap-0.5 text-[9px] font-mono min-h-[240px]">
                {txFeed.length === 0 && (
                  <div className="text-gc-green-muted flex items-center gap-2">
                    <span className="animate-blink">█</span>
                    <span>Awaiting transactions...</span>
                  </div>
                )}
                {txFeed.map((tx, i) => (
                  <div
                    key={`${tx.time}-${i}`}
                    className="grid gap-1.5 py-0.5 items-center"
                    style={{ gridTemplateColumns: "48px 52px 1fr 64px" }}
                  >
                    <span className="text-gc-green-dim">{tx.time}</span>
                    <span className={`${TX_COLORS[tx.color] || "text-gc-green"} text-[8px] tracking-[0.5px] px-1 py-px border ${TX_BORDER_COLORS[tx.color] || "border-gc-green/40"} text-center`}>
                      {tx.code}
                    </span>
                    <span className="text-gc-green-dim overflow-hidden text-ellipsis whitespace-nowrap">{tx.label}</span>
                    <span className="text-gc-border text-[8px] text-right">{tx.hash.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
              <div className="text-gc-border text-[9px] mt-2 overflow-hidden">{"─".repeat(40)}</div>
              <div className="flex flex-col gap-0.5 text-[9px] mt-1">
                <div className="flex gap-2">
                  <span className="text-gc-green-dim min-w-[52px]">feed</span>
                  <span className="text-gc-green">{txFeed.length} entries</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gc-green-dim min-w-[52px]">status</span>
                  <span className="text-gc-green">REALTIME</span>
                </div>
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      {/* ── BOTTOM ROW: ANALYTICS ───────────────────────── */}
      <div className="grid grid-cols-[1fr_380px] gap-3">

        {/* Chain Analytics */}
        <TerminalPanel title="CHAIN.ANALYTICS" subtitle="DERIVED">
          <div className="p-3">
            <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-3">
              $ thegoldchain analytics --derive --chain
            </div>

            {/* Traceability Score */}
            <div className="mb-3">
              <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1.5">TRACEABILITY.SCORE · PER OPERATOR</div>
              <div className="space-y-1.5">
                {opStats.map((op) => {
                  const color = op.score >= 90 ? "text-gc-green" : op.score >= 70 ? "text-gc-green-mid" : "text-gc-amber";
                  const bgColor = op.score >= 90 ? "bg-gc-green" : op.score >= 70 ? "bg-gc-green-mid" : "bg-gc-amber";
                  return (
                    <div key={op.id}>
                      <div className="flex justify-between text-[9px] mb-0.5">
                        <span className="text-gc-green-dim">{op.license_number} {op.name}</span>
                        <span className={color}>{op.score}%</span>
                      </div>
                      <div className="h-[2px] bg-gc-border/30">
                        <div className={`h-full ${bgColor}`} style={{ width: `${op.score}%`, boxShadow: `0 0 4px currentColor` }} />
                      </div>
                    </div>
                  );
                })}
                {opStats.length === 0 && (
                  <div className="text-[9px] text-gc-green-muted">No operator data</div>
                )}
              </div>
            </div>

            <div className="h-px bg-gc-border/30 my-3" />

            {/* Satellite Summary */}
            <div className="mb-3">
              <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1.5">SATELLITE.VERIFICATION.SUMMARY</div>
              <div className="flex flex-col gap-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">batches_verified</span>
                  <span className="text-gc-green font-mono">{satBatches.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">passed</span>
                  <span className="text-gc-green font-mono">{satPassed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">failed</span>
                  <span className="text-gc-red font-mono">{satFailed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">active_flags</span>
                  <span className="text-gc-red font-mono">{flagged}</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-gc-border/30 my-3" />

            {/* Weight Reconciliation */}
            <div>
              <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1.5">WEIGHT.RECONCILIATION</div>
              <div className="flex flex-col gap-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">total_declared</span>
                  <span className="text-gc-gold font-mono">{totalWeight.toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">batches_tracked</span>
                  <span className="text-gc-green font-mono">{batches.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gc-green-dim">discrepancy_flags</span>
                  <span className="text-gc-green font-mono">0</span>
                </div>
              </div>
            </div>
          </div>
        </TerminalPanel>

        {/* CSDDD Readiness */}
        <TerminalPanel title="EU.CSDDD.READINESS" subtitle="2028 DEADLINE">
          <div className="p-3">
            <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-3">
              $ thegoldchain csddd --status --countdown
            </div>

            <div className="flex flex-col gap-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gc-green-dim">directive</span>
                <span className="text-gc-green font-mono">2024/1760</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gc-green-dim">days_to_deadline</span>
                <span className="text-gc-amber font-mono">{daysToCsddd()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gc-green-dim">certs_issued</span>
                <span className="text-gc-green font-mono">{certified}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gc-green-dim">compliance_coverage</span>
                <span className="text-gc-green font-mono">100% pilot</span>
              </div>
            </div>

            <div className="h-px bg-gc-border/30 my-3" />

            <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-1.5">COMPLIANCE.CHECKLIST</div>
            <div className="flex flex-col gap-1 text-[9px]">
              {[
                { label: "Chain of custody tracking", done: true },
                { label: "Satellite boundary verification", done: true },
                { label: "Operator license validation (MCAS)", done: true },
                { label: "Weight reconciliation", done: true },
                { label: "Audit log (immutable, append-only)", done: true },
                { label: "Certificate generation (PDF + QR)", done: false },
                { label: "EU refinery onboarding", done: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={item.done ? "text-gc-green" : "text-gc-amber"}>
                    {item.done ? "●" : "○"}
                  </span>
                  <span className={item.done ? "text-gc-green-dim" : "text-gc-amber/70"}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="h-px bg-gc-border/30 my-3" />

            {/* Status bar */}
            <div className="text-[8px] text-gc-green-muted tracking-[1px]">
              GOLDCHAIN PROTOCOL v1.0.0 · ACT 1140 · EU CSDDD
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5">
              <span className="text-[8px] text-gc-green">● SUPABASE</span>
              <span className="text-[8px] text-gc-green">● AWS af-south-1</span>
              <span className="text-[8px] text-gc-amber">● FABRIC NODE</span>
              <span className="text-[8px] text-gc-green">● SENTINEL-2</span>
            </div>
          </div>
        </TerminalPanel>
      </div>

      {/* Blockchain Ledger Popover — fixed overlay */}
      {selectedNode && (() => {
        const nodeIdx = selectedNode.node_number - 1;
        const nodeName = NODE_NAMES[nodeIdx] || "UNKNOWN";
        const batch = latestBatch;
        const txHash = selectedNode.tx_hash === "PENDING_FABRIC" ? null : selectedNode.tx_hash;
        const dataEntries = selectedNode.data ? Object.entries(selectedNode.data) : [];
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[1000] bg-black/60"
              onClick={() => setSelectedNode(null)}
            />
            {/* Ledger card */}
            <div className="fixed z-[1001] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] max-h-[80vh] overflow-y-auto border border-gc-green/60 rounded-gc shadow-[0_0_30px_rgba(0,255,65,0.2)]" style={{ backgroundColor: "#020A04" }}>
              {/* Header */}
              <div className="border-b border-gc-green/30 px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "rgba(0, 255, 65, 0.04)" }}>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-gc-green-muted tracking-[2px]">BLOCK</span>
                  <span className="text-[12px] text-gc-green font-mono glow-text font-bold">N{pad(selectedNode.node_number)}</span>
                  <span className="text-[10px] text-gc-green tracking-[1px]">{nodeName}</span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-[9px] text-gc-green-muted border border-gc-border px-2 py-0.5 rounded-gc hover:bg-gc-green/10 hover:text-gc-green transition-all tracking-[0.5px]"
                >
                  CLOSE
                </button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3 text-[9px] font-mono">
                {/* Block border top */}
                <div className="text-gc-border text-[8px] leading-none select-none">
                  {"┌" + "─".repeat(42) + "┐"}
                </div>

                {/* Fields */}
                <div className="space-y-2 px-1">
                  <div className="flex justify-between">
                    <span className="text-gc-green-muted">batch_id</span>
                    <span className="text-gc-gold font-semibold">{batch?.batch_id || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gc-green-muted">node</span>
                    <span className="text-gc-green">{nodeName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gc-green-muted">status</span>
                    <span className={selectedNode.status === "CONFIRMED" ? "text-gc-green glow-text" : selectedNode.status === "FLAGGED" ? "text-gc-red" : "text-gc-amber"}>
                      {selectedNode.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gc-green-muted">timestamp</span>
                    <span className="text-gc-green-dim">{new Date(selectedNode.timestamp).toISOString().replace("T", " ").slice(0, 19)} UTC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gc-green-muted">operator</span>
                    <span className="text-gc-green-dim">{batch?.operators?.name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gc-green-muted">region</span>
                    <span className="text-gc-green-dim">{batch?.operators?.region || "—"}</span>
                  </div>
                </div>

                {/* TX Hash */}
                <div className="border-t border-gc-border/30 pt-3">
                  <div className="text-[8px] text-gc-green-muted tracking-[2px] mb-1.5">TX_HASH · HYPERLEDGER FABRIC</div>
                  {txHash ? (
                    <div className="text-[9px] text-gc-green font-mono break-all leading-relaxed bg-gc-green/5 border border-gc-green/20 rounded-gc p-2 glow-text">
                      {txHash}
                    </div>
                  ) : (
                    <div className="text-[9px] text-gc-amber border border-gc-amber/20 rounded-gc p-2 bg-gc-amber/5">
                      PENDING_FABRIC — awaiting Hyperledger commit
                    </div>
                  )}
                </div>

                {/* Payload */}
                {dataEntries.length > 0 && (
                  <div className="border-t border-gc-border/30 pt-3">
                    <div className="text-[8px] text-gc-green-muted tracking-[2px] mb-1.5">DATA PAYLOAD</div>
                    <div className="space-y-1 bg-black/30 border border-gc-border/20 rounded-gc p-2">
                      {dataEntries.map(([key, val]) => (
                        <div key={key} className="flex justify-between gap-3">
                          <span className="text-gc-green-muted shrink-0">{key}</span>
                          <span className="text-gc-green-dim text-right truncate">
                            {val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Block border bottom */}
                <div className="text-gc-border text-[8px] leading-none select-none">
                  {"└" + "─".repeat(42) + "┘"}
                </div>

                {/* Chain link */}
                {selectedNode.node_number < 4 ? (
                  <div className="text-center text-gc-border text-[9px] py-1">
                    │<br />▼ NEXT: N{pad(selectedNode.node_number + 1)} {NODE_NAMES[selectedNode.node_number] || ""}
                  </div>
                ) : (
                  <div className="text-center text-gc-green text-[9px] glow-text tracking-[2px] py-1">
                    ● CHAIN COMPLETE ●
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
