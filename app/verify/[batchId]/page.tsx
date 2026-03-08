import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function VerifyPage({
  params,
}: {
  params: { batchId: string };
}) {
  const supabase = createClient();

  // Public page — uses anon key (no auth required)
  const { data: cert } = await supabase
    .from("csddd_certificates")
    .select(`
      *,
      gold_batches!inner (
        batch_id,
        declared_weight_kg,
        status,
        operators (name, region)
      )
    `)
    .eq("gold_batches.batch_id", params.batchId)
    .single();

  if (!cert) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="terminal-panel max-w-lg w-full">
          <div className="panel-titlebar">
            <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
              [ VERIFY.CSDDD ]
            </span>
          </div>
          <div className="relative z-[1] p-8 text-center">
            <div className="text-gc-red text-[14px] font-vt mb-2">CERTIFICATE NOT FOUND</div>
            <div className="text-gc-green-dim text-[11px]">
              Batch <span className="text-gc-green">{params.batchId}</span> has no CSDDD certificate issued.
            </div>
            <div className="text-gc-border text-[9px] mt-4 tracking-[1px]">
              THE GOLDCHAIN · GHANA GOLD BOARD ACT 2025 (ACT 1140)
            </div>
          </div>
        </div>
      </div>
    );
  }

  const batch = cert.gold_batches as any;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="terminal-panel max-w-lg w-full">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ CSDDD.CERTIFICATE.VERIFIED ]
          </span>
          <span className="text-[9px] text-gc-green glow-text tracking-[1px]">
            VALID
          </span>
        </div>
        <div className="relative z-[1] p-6 space-y-4">
          <div className="text-center">
            <div className="text-gc-green text-[18px] font-vt glow-text tracking-[2px]">
              EU CSDDD COMPLIANCE CERTIFICATE
            </div>
            <div className="text-gc-green-dim text-[10px] tracking-[1px] mt-1">
              DIRECTIVE 2024/1760 · CORPORATE SUSTAINABILITY DUE DILIGENCE
            </div>
          </div>

          <div className="border border-gc-border rounded-gc p-4 space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gc-green-dim">batch_id</span>
              <span className="text-gc-green font-mono">{batch.batch_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">operator</span>
              <span className="text-gc-green-mid">{batch.operators?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">region</span>
              <span className="text-gc-green-muted">{batch.operators?.region}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">weight_kg</span>
              <span className="text-gc-gold font-mono">{batch.declared_weight_kg}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">issued_at</span>
              <span className="text-gc-green-muted">
                {new Date(cert.issued_at).toISOString()}
              </span>
            </div>
          </div>

          <div className="border border-gc-border rounded-gc p-4 space-y-2 text-[10px]">
            <div className="text-[8px] text-gc-green-muted tracking-[1.5px] mb-2">
              BLOCKCHAIN TX HASHES
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">node_1_tx</span>
              <span className="text-gc-green-mid font-mono text-[9px] truncate max-w-[200px]">{cert.node_1_tx}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">node_2_tx</span>
              <span className="text-gc-green-mid font-mono text-[9px] truncate max-w-[200px]">{cert.node_2_tx}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gc-green-dim">node_3_tx</span>
              <span className="text-gc-green-mid font-mono text-[9px] truncate max-w-[200px]">{cert.node_3_tx}</span>
            </div>
            <div className="border-t border-gc-border pt-2 mt-2 flex justify-between">
              <span className="text-gc-green-dim">audit_trail_hash</span>
              <span className="text-gc-green font-mono text-[9px] truncate max-w-[200px] glow-text">{cert.audit_trail_hash}</span>
            </div>
          </div>

          <div className="text-center text-[8px] text-gc-border tracking-[1px]">
            GHANA GOLD BOARD ACT 2025 (ACT 1140) · HYPERLEDGER FABRIC · VERIFIED ON-CHAIN
          </div>
        </div>
      </div>
    </div>
  );
}
