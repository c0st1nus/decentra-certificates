import { ArrowLeft, FileSpreadsheet, ImagePlus, ShieldCheck, ToggleRight } from "lucide-react";
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
          <div>
            <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
              Decentrathon Admin
            </p>
            <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">Панель управления</h1>
          </div>

          <Link
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/64 transition hover:border-primary/30 hover:text-white"
            href="/"
          >
            <ArrowLeft className="size-3.5" />
            Public page
          </Link>
        </header>

        <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[1fr_380px] lg:gap-8 lg:py-10">
          <div className="space-y-6">
            <div className="max-w-2xl space-y-4">
              <p className="font-pixel text-[10px] uppercase tracking-[0.28em] text-primary/85">
                Lightweight shell
              </p>
              <p className="text-sm leading-6 text-white/68 sm:text-base">
                Здесь будет отдельный flow для админа: логин, загрузка шаблона, импорт участников и
                переключение выдачи. Пока оставляю только компактный каркас без тяжелых таблиц и
                лишней client-side логики.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <GlowCard eyebrow="Auth" title="JWT access и refresh flow" />
              <GlowCard eyebrow="Templates" title="PNG, JPG, PDF + настройка layout" />
              <GlowCard eyebrow="Import" title="CSV/XLSX и быстрая проверка базы" />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">
                Planned sections
              </p>
              <div className="mt-4 grid gap-3">
                <AdminRow
                  icon={<ShieldCheck className="size-4 text-primary" />}
                  title="Admin login"
                  text="Логин, пароль, защищенные маршруты и ограничение попыток входа."
                />
                <AdminRow
                  icon={<ImagePlus className="size-4 text-primary" />}
                  title="Template upload"
                  text="Загрузка шаблонов и настройка позиции имени на сертификате."
                />
                <AdminRow
                  icon={<FileSpreadsheet className="size-4 text-primary" />}
                  title="Participants import"
                  text="Импорт CSV/XLSX и проверка обязательных полей."
                />
                <AdminRow
                  icon={<ToggleRight className="size-4 text-primary" />}
                  title="Issuance control"
                  text="Отдельный переключатель выдачи и текущее состояние системы."
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

            <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-black/25 p-4">
              <p className="text-sm leading-6 text-white/62">
                Следующий шаг здесь очевидный: подключить реальные формы к Rust API, но не
                превращать панель в один длинный экран. Под каждую задачу будет свой компактный блок
                или отдельная страница.
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
    <div className="flex gap-3 rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-white/58">{label}</span>
      <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-primary">
        {value}
      </span>
    </div>
  );
}
