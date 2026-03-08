"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DeclarePage() {
  const [weight, setWeight] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // Auto-capture GPS on mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsLat(pos.coords.latitude.toFixed(6));
          setGpsLng(pos.coords.longitude.toFixed(6));
        },
        () => {} // GPS denied — manual entry
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const supabase = createClient();

      // Get current user's operator_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("operator_id")
        .eq("id", user.id)
        .single();

      if (!profile?.operator_id) throw new Error("No operator linked to this account");

      // Create gold batch
      const { data: batch, error: batchError } = await supabase
        .from("gold_batches")
        .insert({
          operator_id: profile.operator_id,
          declared_weight_kg: parseFloat(weight),
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Create Node 01 record
      const { error: nodeError } = await supabase
        .from("batch_nodes")
        .insert({
          batch_id: batch.id,
          node_number: 1,
          officer_id: user.id,
          status: "CONFIRMED",
          data: {
            gps_lat: parseFloat(gpsLat) || null,
            gps_lng: parseFloat(gpsLng) || null,
            field_notes: notes || null,
            declared_weight_kg: parseFloat(weight),
          },
        });

      if (nodeError) throw nodeError;

      setStatus("success");
      setMessage(`Batch ${batch.batch_id} declared. Node 01 confirmed. Satellite verification will trigger within 24h.`);
      setWeight("");
      setNotes("");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to submit declaration");
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain declare --node-01 --production
      </div>

      <div className="terminal-panel">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ NODE.01.MINE.DECLARATION ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            FIELD FORM
          </span>
        </div>

        <div className="relative z-[1] p-6 space-y-4">
          <div className="text-[9px] text-gc-amber border border-gc-amber/30 bg-gc-amber/5 px-3 py-2 rounded-gc">
            This declaration creates an immutable Node 01 record on the Hyperledger Fabric blockchain.
            Ensure all data is accurate before submitting.
          </div>

          {/* Weight */}
          <div>
            <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
              DECLARED_WEIGHT_KG *
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.001"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-gold font-mono outline-none focus:border-gc-green-dim caret-gc-green"
              placeholder="12.4000"
              required
            />
          </div>

          {/* GPS Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
                GPS_LAT
              </label>
              <input
                type="text"
                value={gpsLat}
                onChange={(e) => setGpsLat(e.target.value)}
                className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-green font-mono outline-none focus:border-gc-green-dim caret-gc-green"
                placeholder="5.3019"
              />
            </div>
            <div>
              <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
                GPS_LNG
              </label>
              <input
                type="text"
                value={gpsLng}
                onChange={(e) => setGpsLng(e.target.value)}
                className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-green font-mono outline-none focus:border-gc-green-dim caret-gc-green"
                placeholder="-2.0152"
              />
            </div>
          </div>

          {/* Field Notes */}
          <div>
            <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
              FIELD_NOTES
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-green font-mono outline-none focus:border-gc-green-dim caret-gc-green resize-none"
              placeholder="Morning extraction, Pit B-7"
            />
          </div>

          {/* Status messages */}
          {status === "success" && (
            <div className="text-gc-green text-[10px] border border-gc-green/30 bg-gc-green/5 px-3 py-2 rounded-gc glow-text">
              {message}
            </div>
          )}
          {status === "error" && (
            <div className="text-gc-red text-[10px] border border-gc-red/30 bg-gc-red/5 px-3 py-2 rounded-gc">
              ERR: {message}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={status === "loading" || !weight}
            className="w-full border border-gc-green-dim bg-gc-green/5 text-gc-green text-[11px] tracking-[1px] py-3 rounded-gc font-mono hover:bg-gc-green/10 hover:border-gc-green transition-all disabled:opacity-50"
          >
            {status === "loading" ? (
              <span className="animate-blink">WRITING TO BLOCKCHAIN...</span>
            ) : (
              "[ SUBMIT DECLARATION → NODE 01 ]"
            )}
          </button>

          <div className="text-[8px] text-gc-border tracking-[1px] text-center">
            SATELLITE VERIFICATION WILL BE TRIGGERED AUTOMATICALLY WITHIN 24H
          </div>
        </div>
      </div>
    </div>
  );
}
