import { ToggleRight } from "lucide-react";

import { IssuanceToggleCard } from "@/components/issuance-toggle-card";

export default function AdminIssuancePage() {
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <ToggleRight className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Issuance
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">Переключатель выдачи.</h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Before enabling public issuance, the system checks for an active template, layout and a
          non-empty participants base.
        </p>
      </div>

      <IssuanceToggleCard />
    </section>
  );
}
