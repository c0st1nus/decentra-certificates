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
              <p className="truncate font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Decentrathon
              </p>
              <p className="truncate text-sm text-white/58">Certificate claim page</p>
            </div>
          </div>
        </header>

        <section className="flex flex-1 items-center py-8 sm:py-12">
          <div className="mx-auto w-full max-w-2xl space-y-8 text-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 self-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
                <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
                  Decentrathon 5.0
                </span>
              </div>

              <h1 className="heading-hero text-gradient justify-center">
                Получите сертификат за участие в Decentrathon 5.0
              </h1>

              <p className="mx-auto max-w-xl text-sm leading-6 text-white/68 sm:text-base">
                Введите e-mail, указанный при регистрации. Если адрес есть в базе, мы либо сразу
                отдадим готовый PDF, либо поднимем ваш сертификат в приоритетную очередь и покажем
                live-статус сборки.
              </p>
            </div>

            <div className="text-left">
              <EmailRequestForm />
            </div>

            <p className="text-xs leading-5 text-white/42">
              Сертификат выдается только после серверной проверки базы участников и серверной
              генерации PDF.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
