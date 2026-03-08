"use client";

import { useState, useEffect } from "react";
import { declareAction } from "@/lib/actions/declarations";
import { declareSchema } from "@/lib/validations";
import { useOnlineStatus, useOfflineDeclaration } from "@/lib/offline/hooks";
import { TerminalPanel } from "@/components/TerminalPanel";

export default function DeclarePage() {
  const [weight, setWeight] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const { isOnline, pendingCount } = useOnlineStatus();
  const { submit: queueOffline, syncNow, pendingDeclarations, syncStatus, lastSyncResult, offlineReady } = useOfflineDeclaration();

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

  // Listen for Service Worker messages (sync requests and completions)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "SYNC_COMPLETE" || event.data?.type === "SYNC_REQUESTED") {
          syncNow();
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, [syncNow]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    setFieldErrors({});

    const input = {
      declared_weight_kg: parseFloat(weight) || 0,
      gps_lat: gpsLat ? parseFloat(gpsLat) : null,
      gps_lng: gpsLng ? parseFloat(gpsLng) : null,
      field_notes: notes || null,
      captured_at: !isOnline ? new Date().toISOString() : null,
    };

    // Client-side validation
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

    // OFFLINE: queue the declaration
    if (!isOnline) {
      try {
        await queueOffline({
          declared_weight_kg: input.declared_weight_kg,
          gps_lat: input.gps_lat,
          gps_lng: input.gps_lng,
          field_notes: input.field_notes,
        });
        setStatus("success");
        setMessage("Declaration queued offline. Will sync automatically when connectivity returns.");
        setWeight("");
        setNotes("");
        setFieldErrors({});
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Failed to queue declaration offline. Please try again.");
      }
      return;
    }

    // ONLINE: submit via server action
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

  const failedDeclarations = pendingDeclarations.filter((d) => d.status === "failed");
  const queuedDeclarations = pendingDeclarations.filter((d) => d.status === "pending" || d.status === "syncing");

  return (
    <div className="space-y-4 max-w-xl">
      <div className="text-[10px] text-gc-green-dim tracking-[1px]">
        $ thegoldchain declare --node-01 --production
      </div>

      {/* Online/Offline indicator */}
      <div className="flex items-center justify-between text-[9px] tracking-[1px]">
        <div className="flex items-center gap-2">
          <span className={isOnline ? "text-gc-green" : "text-gc-amber"}>
            {isOnline ? "\u25CF" : "\u25CB"}
          </span>
          <span className={isOnline ? "text-gc-green-dim" : "text-gc-amber"}>
            {isOnline ? "NETWORK ONLINE" : "OFFLINE MODE"}
          </span>
        </div>
        {pendingCount > 0 && (
          <span className="text-gc-amber">
            {pendingCount} QUEUED
          </span>
        )}
      </div>

      {/* Offline not ready warning */}
      {!isOnline && !offlineReady && (
        <div className="text-[9px] text-gc-amber border border-gc-amber/30 bg-gc-amber/5 px-3 py-2 rounded-gc tracking-[1px]">
          OFFLINE MODE UNAVAILABLE — Connect to the network and refresh to enable offline declarations.
        </div>
      )}

      {/* Token expired banner */}
      {syncStatus === "token_expired" && (
        <div className="text-[9px] text-gc-red border border-gc-red/30 bg-gc-red/5 px-3 py-2 rounded-gc tracking-[1px]">
          SESSION EXPIRED — Please <a href="/login" className="underline">log in again</a> to sync pending declarations.
        </div>
      )}

      {/* Sync status banner */}
      {syncStatus === "syncing" && (
        <div className="text-[9px] text-gc-cyan border border-gc-cyan/30 bg-gc-cyan/5 px-3 py-2 rounded-gc animate-blink tracking-[1px]">
          SYNCING {queuedDeclarations.length} DECLARATION{queuedDeclarations.length !== 1 ? "S" : ""}...
        </div>
      )}
      {syncStatus === "done" && lastSyncResult && lastSyncResult.synced > 0 && (
        <div className="text-[9px] text-gc-green border border-gc-green/30 bg-gc-green/5 px-3 py-2 rounded-gc glow-text tracking-[1px]">
          SYNCED {lastSyncResult.synced} DECLARATION{lastSyncResult.synced !== 1 ? "S" : ""} SUCCESSFULLY
        </div>
      )}

      <TerminalPanel title="NODE.01.MINE.DECLARATION" subtitle="FIELD FORM">
        <div className="p-6 space-y-4">
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
                min="0.0001"
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
                <span className="animate-blink">
                  {isOnline ? "WRITING TO BLOCKCHAIN..." : "QUEUING OFFLINE..."}
                </span>
              ) : isOnline ? (
                "[ SUBMIT DECLARATION \u2192 NODE 01 ]"
              ) : (
                "[ QUEUE DECLARATION (OFFLINE) ]"
              )}
            </button>
          </form>

          <div className="text-[8px] text-gc-border tracking-[1px] text-center">
            SATELLITE VERIFICATION WILL BE TRIGGERED AUTOMATICALLY WITHIN 24H
          </div>
        </div>
      </TerminalPanel>

      {/* Pending Queue */}
      {queuedDeclarations.length > 0 && (
        <TerminalPanel
          title="PENDING.QUEUE"
          titleColor="text-gc-amber"
          subtitle={`${queuedDeclarations.length} WAITING`}
        >
          <div className="p-4 space-y-2">
            {queuedDeclarations.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-[9px] border-b border-gc-border/20 pb-2"
              >
                <div className="flex items-center gap-2">
                  <span className={d.status === "syncing" ? "text-gc-cyan animate-blink" : "text-gc-amber"}>
                    {d.status === "syncing" ? "\u25B6" : "\u25CB"}
                  </span>
                  <span className="text-gc-gold font-mono">{d.payload.declared_weight_kg} kg</span>
                  <span className="text-gc-green-muted">
                    {d.payload.gps_lat?.toFixed(4)}, {d.payload.gps_lng?.toFixed(4)}
                  </span>
                </div>
                <span className="text-gc-green-muted">
                  {new Date(d.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {isOnline && (
              <button
                onClick={syncNow}
                disabled={syncStatus === "syncing"}
                className="w-full mt-2 text-[9px] text-gc-green border border-gc-green/30 py-1.5 rounded-gc hover:bg-gc-green/10 transition-all disabled:opacity-50 tracking-[1px]"
              >
                {syncStatus === "syncing" ? "SYNCING..." : "[ SYNC NOW ]"}
              </button>
            )}
          </div>
        </TerminalPanel>
      )}

      {/* Failed Declarations */}
      {failedDeclarations.length > 0 && (
        <TerminalPanel
          title="FAILED.DECLARATIONS"
          titleColor="text-gc-red"
          subtitle={String(failedDeclarations.length)}
        >
          <div className="p-4 space-y-2">
            {failedDeclarations.map((d) => (
              <div
                key={d.id}
                className="text-[9px] border-b border-gc-border/20 pb-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-gc-gold font-mono">{d.payload.declared_weight_kg} kg</span>
                  <span className="text-gc-red">{d.errorMessage}</span>
                </div>
              </div>
            ))}
          </div>
        </TerminalPanel>
      )}
    </div>
  );
}
