import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { EmailRequestForm } from "@/components/email-request-form";
import { GlowCard } from "@/components/glow-card";
import { GridBackground } from "@/components/grid-background";

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <GridBackground />

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_24px_rgba(140,216,18,0.16)]">
              <BadgeCheck className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Decentrathon
              </p>
              <p className="truncate text-sm text-white/58">Certificates Platform</p>
            </div>
          </div>

          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/64 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/admin"
          >
            Admin
            <ArrowRight className="size-3.5" />
          </Link>
        </header>

        <section className="grid flex-1 items-start gap-6 py-6 lg:grid-cols-[1fr_420px] lg:gap-8 lg:py-10">
          <div className="space-y-6">
            <div className="max-w-2xl space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
                <Sparkles className="size-4 text-primary" />
                <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
                  Public issuance
                </span>
              </div>

              <h1 className="heading-hero text-gradient text-left">
                Получение сертификата без лишнего шума.
              </h1>

              <p className="max-w-xl text-sm leading-6 text-white/68 sm:text-base">
                Введите e-mail, backend сверит базу участников, сгенерирует PDF на сервере и вернет
                ссылку на скачивание. Имя не раскрывается до серверной валидации.
              </p>

              <div className="flex flex-wrap gap-3">
                <Pill label="Server-only" value="Name comes from DB" />
                <Pill label="PDF" value="Generated on backend" />
                <Pill label="Verify" value="Code and download URL included" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <GlowCard
                eyebrow="Protected"
                title="Имя и данные участников не уходят на клиент до проверки."
              />
              <GlowCard eyebrow="Fast path" title="Один e-mail, одна проверка, один готовый PDF." />
              <GlowCard
                eyebrow="Reusable"
                title="Форму и рендер можно переиспользовать для новых событий."
              />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">
                How it works
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StepCard number="01" title="Ввод e-mail" />
                <StepCard number="02" title="Проверка по базе" />
                <StepCard number="03" title="Скачивание PDF" />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary">
                    Operational note
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/64">
                    Выдача может быть отключена администратором. В этом случае форма покажет
                    отдельное состояние и не раскроет лишние детали.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <EmailRequestForm />
        </section>
      </div>
    </main>
  );
}

function StepCard({ number, title }: { number: string; title: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary/80">{number}</p>
      <p className="mt-3 text-sm text-white/72">{title}</p>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">
      <p className="font-pixel text-[10px] uppercase tracking-[0.18em] text-primary">{label}</p>
      <p className="mt-1 text-xs text-white/65">{value}</p>
    </div>
  );
}
