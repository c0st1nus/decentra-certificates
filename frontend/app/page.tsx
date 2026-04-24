import { BadgeCheck } from "lucide-react";

import { EmailRequestForm } from "@/components/email-request-form";
import { GridBackground } from "@/components/grid-background";

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <GridBackground />

      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_24px_rgba(140,216,18,0.16)]">
              <BadgeCheck className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="admin-eyebrow truncate">Decentrathon</p>
              <p className="truncate text-sm text-white/60">Certificate claim page</p>
            </div>
          </div>
        </header>

        <section className="flex flex-1 items-center py-8 sm:py-12">
          <div className="mx-auto w-full max-w-2xl space-y-8 text-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 self-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Decentrathon 5.0
                </span>
              </div>

              <h1 className="heading-hero text-gradient justify-center">
                Get your Decentrathon 5.0 certificate
              </h1>

              <p className="mx-auto max-w-xl text-sm leading-6 text-white/70 sm:text-base">
                Enter the email you used during registration. If it is in our database, we will
                either serve a ready PDF or bump your certificate to the priority queue and show a
                live build status.
              </p>
            </div>

            <div className="text-left">
              <EmailRequestForm />
            </div>

            <p className="text-xs leading-5 text-white/50">
              Certificates are issued only after server-side participant verification and
              server-side PDF generation.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
