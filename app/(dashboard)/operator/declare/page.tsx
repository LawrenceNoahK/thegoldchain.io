"use client";

import { useState, useEffect } from "react";
import { declareAction } from "@/lib/actions/declarations";
import { declareSchema } from "@/lib/validations";

export default function DeclarePage() {
  const [weight, setWeight] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isOnline, setIsOnline] = useState(true);

  // Track online/offline status
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
    setFieldErrors({});

    // Client-side validation first
    const input = {
      declared_weight_kg: parseFloat(weight) || 0,
      gps_lat: gpsLat ? parseFloat(gpsLat) : null,
      gps_lng: gpsLng ? parseFloat(gpsLng) : null,
      field_notes: notes || null,
      captured_at: !isOnline ? new Date().toISOString() : null,
    };

    const clientValidation = declareSchema.safeParse(input);
    if (!clientValidation.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of clientValidation.error.issues) {
        const field = issue.path.join(".");
        if (!errors[field]) errors[field] = [];
        errors[field].push(issue.message);
      }
      setFieldErrors(errors);
      setStatus("error");
      setMessage("Validation failed. Please check the fields above.");
      return;
    }

    try {
      const result = await declareAction(input);

      if (result.success) {
        setStatus("success");
        setMessage(`Batch ${result.batchId} declared. Node 01 confirmed. Satellite verification will trigger within 24h.`);
        setWeight("");
        setNotes("");
        setFieldErrors({});
      } else {
        setStatus("error");
        setMessage(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    } catch {
      setStatus("error");
      setMessage("Failed to submit declaration. Please try again.");
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain declare --node-01 --production
      </div>

      {/* Online/Offline indicator */}
      <div className="flex items-center gap-2 text-[9px] tracking-[1px]">
        <span className={isOnline ? "text-gc-green" : "text-gc-amber"}>
          {isOnline ? "\u25CF" : "\u25CB"}
        </span>
        <span className={isOnline ? "text-gc-green-dim" : "text-gc-amber"}>
          {isOnline ? "NETWORK ONLINE" : "OFFLINE MODE — DECLARATION WILL BE QUEUED"}
        </span>
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

          <form onSubmit={handleSubmit} className="space-y-4">
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
              {fieldErrors.declared_weight_kg && (
                <div className="text-gc-red text-[9px] mt-1">
                  {fieldErrors.declared_weight_kg.join(", ")}
                </div>
              )}
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
                {fieldErrors.gps_lat && (
                  <div className="text-gc-red text-[9px] mt-1">
                    {fieldErrors.gps_lat.join(", ")}
                  </div>
                )}
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
                {fieldErrors.gps_lng && (
                  <div className="text-gc-red text-[9px] mt-1">
                    {fieldErrors.gps_lng.join(", ")}
                  </div>
                )}
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
                maxLength={500}
                className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-green font-mono outline-none focus:border-gc-green-dim caret-gc-green resize-none"
                placeholder="Morning extraction, Pit B-7"
              />
              {fieldErrors.field_notes && (
                <div className="text-gc-red text-[9px] mt-1">
                  {fieldErrors.field_notes.join(", ")}
                </div>
              )}
              <div className="text-[8px] text-gc-border text-right mt-0.5">
                {notes.length}/500
              </div>
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
              type="submit"
              disabled={status === "loading" || !weight}
              className="w-full border border-gc-green-dim bg-gc-green/5 text-gc-green text-[11px] tracking-[1px] py-3 rounded-gc font-mono hover:bg-gc-green/10 hover:border-gc-green transition-all disabled:opacity-50"
            >
              {status === "loading" ? (
                <span className="animate-blink">WRITING TO BLOCKCHAIN...</span>
              ) : (
                "[ SUBMIT DECLARATION \u2192 NODE 01 ]"
              )}
            </button>
          </form>

          <div className="text-[8px] text-gc-border tracking-[1px] text-center">
            SATELLITE VERIFICATION WILL BE TRIGGERED AUTOMATICALLY WITHIN 24H
          </div>
        </div>
      </div>
    </div>
  );
}
