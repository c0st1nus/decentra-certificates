"use client";

import { LoaderCircle, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";

import {
  type IssuanceStatusResponse,
  fetchIssuanceStatus,
  updateIssuanceStatus,
} from "@/lib/admin-api";

export function IssuanceToggleCard() {
  const [status, setStatus] = useState<IssuanceStatusResponse | null>(null);
  const [message, setMessage] = useState("Loading issuance state...");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const { data } = await fetchIssuanceStatus();
      if (!isMounted) {
        return;
      }
      setStatus(data);
      setMessage(data ? "Issuance state loaded." : "Failed to load issuance state.");
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function toggle() {
    if (!status) {
      return;
    }

    setIsLoading(true);
    setMessage("Updating issuance state...");

    try {
      const { response, data } = await updateIssuanceStatus(!status.enabled);
      if (!response.ok || !data) {
        setMessage("Could not update issuance state.");
        setIsLoading(false);
        return;
      }

      setStatus(data);
      setMessage(data.enabled ? "Issuance enabled." : "Issuance disabled.");
    } catch {
      setMessage("Could not update issuance state.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Issuance
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">Switch issuance</h2>
        </div>
        <ToggleRight className="size-5 text-primary/85" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <FlagRow label="Template" value={status?.has_active_template ? "Present" : "Missing"} />
        <FlagRow label="Layout" value={status?.has_layout ? "Configured" : "Missing"} />
        <FlagRow label="Participants" value={status?.participant_count ? "Loaded" : "Empty"} />
        <FlagRow label="Ready" value={status?.ready_to_enable ? "Yes" : "No"} />
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/68">
        {message}
      </div>

      <button
        className="btn-hero glow-primary mt-5 w-full rounded-2xl bg-white/[0.05]"
        disabled={!status || isLoading || (!status.enabled && !status.ready_to_enable)}
        type="button"
        onClick={() => void toggle()}
      >
        {isLoading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Updating
          </>
        ) : (
          <>
            <ToggleRight className="size-4" />
            {status?.enabled ? "Disable issuance" : "Enable issuance"}
          </>
        )}
      </button>
    </section>
  );
}

function FlagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <span className="text-sm text-white/58">{label}</span>
      <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-primary">
        {value}
      </span>
    </div>
  );
}
