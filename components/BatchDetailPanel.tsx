"use client";

import { TerminalPanel } from "./TerminalPanel";
import { StatusBadge, SatBadge } from "./StatusBadge";
import { ChainProgress } from "./ChainProgress";

interface BatchDetailPanelProps {
  batch: any;
  onClose: () => void;
  actions?: React.ReactNode;
}

export function BatchDetailPanel({ batch, onClose, actions }: BatchDetailPanelProps) {
  const nodes = batch.batch_nodes || [];
  const satCheck = batch.satellite_checks;
  const node1Data = nodes.find((n: any) => n.node_number === 1)?.data;

  return (
    <TerminalPanel title={`BATCH.${batch.batch_id}`} subtitle="DETAIL VIEW">
      <div className="p-4 space-y-4">
        {/* Header with close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusBadge status={batch.status} />
            <ChainProgress nodes={nodes} />
          </div>
          <button
            onClick={onClose}
            className="text-[9px] text-gc-green-muted border border-gc-border px-2 py-1 rounded-gc hover:bg-gc-green/10 transition-all tracking-[0.5px]"
          >
            CLOSE
          </button>
        </div>

        {/* Batch info grid */}
        <div className="grid grid-cols-3 gap-3 text-[9px]">
          <div>
            <div className="text-gc-green-muted tracking-[1px] mb-0.5">OPERATOR</div>
            <div className="text-gc-green font-mono">{batch.operators?.name || "\u2014"}</div>
          </div>
          <div>
            <div className="text-gc-green-muted tracking-[1px] mb-0.5">REGION</div>
            <div className="text-gc-green-dim font-mono">{batch.operators?.region || "\u2014"}</div>
          </div>
          <div>
            <div className="text-gc-green-muted tracking-[1px] mb-0.5">WEIGHT_KG</div>
            <div className="text-gc-gold font-mono">{batch.declared_weight_kg}</div>
          </div>
        </div>

        {/* GPS from Node 01 */}
        {node1Data && (node1Data.gps_lat || node1Data.gps_lng) && (
          <div className="grid grid-cols-2 gap-3 text-[9px]">
            <div>
              <div className="text-gc-green-muted tracking-[1px] mb-0.5">GPS_LAT</div>
              <div className="text-gc-green font-mono">{node1Data.gps_lat ?? "\u2014"}</div>
            </div>
            <div>
              <div className="text-gc-green-muted tracking-[1px] mb-0.5">GPS_LNG</div>
              <div className="text-gc-green font-mono">{node1Data.gps_lng ?? "\u2014"}</div>
            </div>
          </div>
        )}

        {/* Satellite check details */}
        {satCheck && (
          <div className="border border-gc-border/30 rounded-gc p-3 space-y-2">
            <div className="text-[8px] text-gc-green-muted tracking-[1.5px]">SATELLITE VERIFICATION</div>
            <div className="flex items-center gap-2">
              <SatBadge status={satCheck.overall_status} />
              {satCheck.flagged_details && (
                <span className="text-[9px] text-gc-red">
                  {typeof satCheck.flagged_details === "string"
                    ? satCheck.flagged_details
                    : satCheck.flagged_details.message || satCheck.flagged_details.check_2_detail || JSON.stringify(satCheck.flagged_details)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[8px]">
              {[
                { key: "check_1_surface_disturbance", label: "SURFACE" },
                { key: "check_2_boundary_compliance", label: "BOUNDARY" },
                { key: "check_3_deforestation", label: "DEFOREST" },
                { key: "check_4_water_proximity", label: "WATER" },
                { key: "check_5_volume_plausibility", label: "VOLUME" },
                { key: "check_6_anomaly_detection", label: "ANOMALY" },
              ].map((check) => {
                const val = satCheck[check.key];
                const color = val === "PASS" ? "text-gc-green" : val === "FAIL" ? "text-gc-red" : "text-gc-amber";
                return (
                  <div key={check.key} className="flex items-center gap-1">
                    <span className={`${color}`}>{val === "PASS" ? "\u25CF" : val === "FAIL" ? "\u2718" : "\u25CB"}</span>
                    <span className="text-gc-green-muted">{check.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Flag reason */}
        {batch.status === "FLAGGED" && (
          <div className="border border-gc-red/30 bg-gc-red/5 rounded-gc p-3">
            <div className="text-[8px] text-gc-red tracking-[1.5px] mb-1">FLAG REASON</div>
            <div className="text-[9px] text-gc-red">
              {(typeof satCheck?.flagged_details === "string"
                ? satCheck.flagged_details
                : satCheck?.flagged_details?.message || satCheck?.flagged_details?.check_2_detail || null) ||
                (node1Data?.stale_declaration ? "Stale declaration (>72h since capture)" : null) ||
                "Batch was flagged during processing"}
            </div>
          </div>
        )}

        {/* Node history */}
        <div className="space-y-1">
          <div className="text-[8px] text-gc-green-muted tracking-[1.5px]">NODE HISTORY</div>
          {nodes
            .sort((a: any, b: any) => a.node_number - b.node_number)
            .map((node: any) => (
              <div
                key={node.id}
                className="flex items-center justify-between text-[9px] border-b border-gc-border/20 py-1"
              >
                <div className="flex items-center gap-2">
                  <span className={node.status === "CONFIRMED" ? "text-gc-green" : "text-gc-red"}>
                    {node.status === "CONFIRMED" ? "\u25CF" : "\u2718"}
                  </span>
                  <span className="text-gc-green-dim">NODE {String(node.node_number).padStart(2, "0")}</span>
                  <span className="text-gc-green-muted">[{node.status}]</span>
                </div>
                <span className="text-gc-border font-mono text-[8px]">
                  {node.tx_hash === "PENDING_FABRIC" ? "TX_PENDING" : node.tx_hash?.slice(0, 12) + "..."}
                </span>
              </div>
            ))}
        </div>

        {/* Action buttons */}
        {actions && <div className="pt-2 border-t border-gc-border/30">{actions}</div>}
      </div>
    </TerminalPanel>
  );
}
