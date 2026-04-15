"use client";

import { ArrowRight, BadgeCheck, Download, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { GlowCard } from "@/components/glow-card";
import { GridBackground } from "@/components/grid-background";
import { cn } from "@/lib/utils";

const statusCopy = {
  idle: "Введите e-mail, который использовался при регистрации.",
  success: "Демо-состояние: запрос принят, сертификат готов к выдаче.",
  error: "Укажите корректный e-mail, чтобы продолжить.",
} as const;

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<keyof typeof statusCopy>("idle");

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
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/64 transition hover:border-primary/30 hover:text-white"
            href="/admin"
          >
            Admin
          </Link>
        </header>

        <section className="grid flex-1 items-start gap-6 py-6 lg:grid-cols-[1fr_420px] lg:gap-8 lg:py-10">
          <div className="space-y-6">
            <div className="max-w-2xl space-y-4">
              <p className="font-pixel text-[10px] uppercase tracking-[0.28em] text-primary/85">
                Public issuance
              </p>
              <h1 className="text-3xl font-black leading-none sm:text-5xl lg:text-6xl">
                Получение сертификата без лишнего шума.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-white/68 sm:text-base">
                Пользователь вводит e-mail, сервер проверяет базу участников и отдает готовый PDF.
                Без ручного ввода имени и без перегруженного интерфейса.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <GlowCard
                eyebrow="Server only"
                title="Имя подтягивается только из базы на backend."
              />
              <GlowCard eyebrow="Fast flow" title="Один основной сценарий без перегруженного UI." />
              <GlowCard eyebrow="Reusable" title="Подходит для следующих хакатонов и программ." />
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
          </div>

          <section className="panel-glow rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                  Certificate Form
                </p>
                <h2 className="mt-3 text-2xl font-bold text-white">Получить сертификат</h2>
              </div>
              <ShieldCheck className="size-5 shrink-0 text-primary/80" />
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setStatus(email.includes("@") ? "success" : "error");
              }}
            >
              <label className="block text-sm font-medium text-white/72" htmlFor="email">
                E-mail участника
              </label>
              <input
                id="email"
                autoComplete="email"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3.5 text-base outline-none transition focus:border-primary/60 focus:bg-black/50"
                placeholder="name@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <button className="cta-button group" type="submit">
                <span>Получить сертификат</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            <div
              className={cn(
                "mt-4 rounded-2xl border px-4 py-3 text-sm leading-6",
                status === "idle" && "border-white/10 bg-white/5 text-white/55",
                status === "success" && "border-primary/30 bg-primary/10 text-primary",
                status === "error" && "border-red-500/30 bg-red-500/10 text-red-300",
              )}
            >
              {statusCopy[status]}
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">
                    Download
                  </p>
                  <p className="mt-2 text-sm text-white/62">
                    Кнопка скачивания появится после успешной выдачи.
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/45"
                  disabled
                  type="button"
                >
                  <Download className="size-4" />
                  PDF
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function StepCard({ number, title }: { number: string; title: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
      <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary/80">{number}</p>
      <p className="mt-3 text-sm text-white/72">{title}</p>
    </div>
  );
}
