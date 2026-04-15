"use client";

import { Activity, ArrowRight, Files, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { GlowCard } from "@/components/glow-card";
import {
  type AdminProfile,
  type IssuanceStatusResponse,
  type TemplateDetail,
  fetchAdminMe,
  fetchIssuanceStatus,
  fetchParticipants,
  fetchTemplates,
  getStoredAdminProfile,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type DashboardState = {
  admin: AdminProfile | null;
  issuance: IssuanceStatusResponse | null;
  templates: TemplateDetail[];
  participantCount: number;
  isLoading: boolean;
  message: string;
};

const initialState: DashboardState = {
  admin: getStoredAdminProfile(),
  issuance: null,
  templates: [],
  participantCount: 0,
  isLoading: true,
  message: "Загружаем рабочее состояние админки...",
};

export default function AdminPage() {
  const [state, setState] = useState<DashboardState>(initialState);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [me, issuance, templates, participants] = await Promise.all([
          fetchAdminMe(),
          fetchIssuanceStatus(),
          fetchTemplates(),
          fetchParticipants({ page: 1, pageSize: 1 }),
        ]);

        if (!isMounted) {
          return;
        }

        setState({
          admin: me.data?.admin ?? getStoredAdminProfile(),
          issuance: issuance.data ?? null,
          templates: templates.data ?? [],
          participantCount: participants.data?.total ?? 0,
          isLoading: false,
          message: "Операционное состояние загружено.",
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          message: "Не удалось загрузить часть данных админки.",
        }));
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeTemplate = state.templates.find(
    (template) => template.template.is_active,
  );

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Activity className="size-4 text-primary" />
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary">
            Admin overview
          </span>
        </div>

        <h1 className="heading-hero text-gradient text-left">
          Операционный центр выдачи.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
          Здесь видно, готова ли система к выдаче, какой шаблон активен и
          сколько участников уже импортировано. Отсюда же можно перейти к
          шаблонам, импорту и переключателю выдачи.
        </p>
      </div>

      <div
        className={cn(
          "rounded-3xl border p-4 text-sm",
          state.isLoading
            ? "border-white/10 bg-white/3 text-white/70"
            : "border-primary/20 bg-primary/10 text-white",
        )}
      >
        {state.message}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          eyebrow="Auth"
          icon={<Users className="size-4 text-primary" />}
          title={state.admin?.login ?? "Signed in"}
          value={state.admin?.role ?? "operator"}
        />
        <StatCard
          eyebrow="Templates"
          icon={<Files className="size-4 text-primary" />}
          title="Active template records"
          value={`${state.templates.filter((template) => template.template.is_active).length}`}
        />
        <StatCard
          eyebrow="Participants"
          icon={<Users className="size-4 text-primary" />}
          title="Imported rows"
          value={`${state.participantCount}`}
        />
        <StatCard
          eyebrow="Issuance"
          icon={<Activity className="size-4 text-primary" />}
          title={state.issuance?.enabled ? "Enabled" : "Disabled"}
          value={state.issuance?.ready_to_enable ? "Ready" : "Blocked"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <GlowCard
              eyebrow="Templates"
              title="Upload assets, edit layout and keep one template active."
            />
            <GlowCard
              eyebrow="Participants"
              title="Import CSV data and keep the current event base clean."
            />
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
            <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary">
              Quick actions
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickLink
                href="/admin/templates"
                title="Manage templates"
                text="Upload, activate and edit layouts."
              />
              <QuickLink
                href="/admin/participants"
                title="Import participants"
                text="Load CSV and inspect validation output."
              />
              <QuickLink
                href="/admin/issuance"
                title="Control issuance"
                text="Enable or disable public issuance."
              />
            </div>
          </div>

          {activeTemplate ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-white/3 p-5 backdrop-blur-xl sm:p-6">
              <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-white/45">
                Active template
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                  {activeTemplate.template.name}
                </div>
                <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70">
                  {activeTemplate.template.source_kind.toUpperCase()}
                </div>
                <Link
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-white/72 transition hover:border-primary/30 hover:text-white"
                  href={`/admin/templates/${activeTemplate.template.id}`}
                >
                  Open details
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="panel-glow rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Readiness
          </p>
          <div className="mt-4 space-y-3">
            <FlagRow
              label="Template"
              value={
                state.issuance?.has_active_template ? "Present" : "Missing"
              }
            />
            <FlagRow
              label="Layout"
              value={state.issuance?.has_layout ? "Configured" : "Missing"}
            />
            <FlagRow
              label="Participants"
              value={state.issuance?.participant_count ? "Loaded" : "Empty"}
            />
            <FlagRow
              label="Issuance"
              value={state.issuance?.enabled ? "Enabled" : "Disabled"}
            />
            <FlagRow
              label="Ready"
              value={state.issuance?.ready_to_enable ? "Yes" : "No"}
            />
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm leading-6 text-white/62">
              Эта панель показывает только операционные факты. Никакие данные
              участников на клиент не подгружаются сверх необходимого для
              админки.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function StatCard({
  eyebrow,
  icon,
  title,
  value,
}: {
  eyebrow: string;
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/4 p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary/30">
      <div className="flex items-center justify-between gap-3">
        <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary/80">
          {eyebrow}
        </p>
        {icon}
      </div>
      <p className="mt-4 text-sm text-white/72">{title}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function FlagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
      <span className="text-sm text-white/58">{label}</span>
      <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-primary">
        {value}
      </span>
    </div>
  );
}

function QuickLink({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-black/30"
      href={href}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-white/62">{text}</p>
    </Link>
  );
}
