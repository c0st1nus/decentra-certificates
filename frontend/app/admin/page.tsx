import {
  ArrowLeft,
  BadgeCheck,
  FileSpreadsheet,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  ToggleRight,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { GlowCard } from "@/components/glow-card";
import { GridBackground } from "@/components/grid-background";

export default function AdminPage() {
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
                Decentrathon Admin
              </p>
              <p className="truncate text-sm text-white/58">Control center</p>
            </div>
          </div>

          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/64 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/"
          >
            <ArrowLeft className="size-3.5" />
            Public page
          </Link>
        </header>

        <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[1fr_380px] lg:gap-8 lg:py-10">
          <div className="space-y-6">
            <div className="max-w-2xl space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
                <Sparkles className="size-4 text-primary" />
                <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
                  Admin shell
                </span>
              </div>

              <h1 className="heading-hero text-gradient text-left">
                Операционный контроль выдачи.
              </h1>

              <p className="max-w-xl text-sm leading-6 text-white/68 sm:text-base">
                Здесь останутся отдельные страницы для шаблонов, импорта и переключателя выдачи.
                Пока это компактный shell, который задает тот же визуальный язык, что и публичная
                часть.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <GlowCard eyebrow="Auth" title="JWT access и refresh flow для admin API." />
              <GlowCard eyebrow="Templates" title="PNG, JPG и PDF с отдельным layout editor." />
              <GlowCard eyebrow="Import" title="CSV/XLSX и быстрая валидация базы участников." />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">
                Planned sections
              </p>
              <div className="mt-4 grid gap-3">
                <AdminRow
                  icon={<ShieldCheck className="size-4 text-primary" />}
                  title="Admin login"
                  text="Отдельный экран входа с защищенной сессией и role checks."
                />
                <AdminRow
                  icon={<ImagePlus className="size-4 text-primary" />}
                  title="Template upload"
                  text="Загрузка шаблонов и сохранение server-side preview path."
                />
                <AdminRow
                  icon={<FileSpreadsheet className="size-4 text-primary" />}
                  title="Participants import"
                  text="Импорт CSV/XLSX и отчет с количеством строк, ошибок и апдейтов."
                />
                <AdminRow
                  icon={<ToggleRight className="size-4 text-primary" />}
                  title="Issuance control"
                  text="Переключатель выдачи и status card с readiness checks."
                />
              </div>
            </div>
          </div>

          <aside className="panel-glow rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
              Admin MVP
            </p>
            <div className="mt-4 space-y-4">
              <AdminStat label="Auth" value="Pending" />
              <AdminStat label="Templates" value="0 uploaded" />
              <AdminStat label="Participants" value="0 imported" />
              <AdminStat label="Issuance" value="Disabled" />
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
              <p className="text-sm leading-6 text-white/62">
                Функции добавляются отдельными страницами, но оболочка остается цельной: темный фон,
                зеленый акцент и pixel-метки для операционных состояний.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function AdminRow({
  icon,
  text,
  title,
}: {
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <div className="flex gap-3 rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-6 text-white/62">{text}</p>
      </div>
    </div>
  );
}

function AdminStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-white/58">{label}</span>
      <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-primary">
        {value}
      </span>
    </div>
  );
}
