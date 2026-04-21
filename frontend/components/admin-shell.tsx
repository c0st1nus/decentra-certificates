"use client";

import {
  BadgeCheck,
  Layers3,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { GridBackground } from "@/components/grid-background";
import { adminLogout, getAdminSession, hasAdminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "Сводка состояния",
    icon: LayoutDashboard,
    match: /^\/admin$/,
  },
  {
    href: "/admin/templates",
    label: "Templates",
    description: "Шаблоны, layout, выдача",
    icon: Layers3,
    match: /^\/admin\/templates(\/.*)?$/,
  },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isCanvasEditorRoute = /^\/admin\/templates\/[^/]+\/layout$/.test(
    pathname,
  );

  useEffect(() => {
    const session = getAdminSession();
    const authenticated = hasAdminSession() && session !== null;
    setIsAuthenticated(authenticated);
    setHydrated(true);

    if (pathname === "/admin/login") {
      if (authenticated) {
        router.replace("/admin");
      }
      return;
    }

    if (!authenticated) {
      router.replace("/admin/login");
    }
  }, [pathname, router]);

  async function handleLogout() {
    await adminLogout();
    router.replace("/admin/login");
  }

  if (!hydrated) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <GridBackground />
        <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
          <div className="rounded-[1.75rem] border border-white/10 bg-panel/90 px-6 py-5 text-sm text-white/68 backdrop-blur-xl">
            Loading admin session...
          </div>
        </div>
      </main>
    );
  }

  if (pathname === "/admin/login") {
    return (
      <main className="relative min-h-screen overflow-hidden">
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
                <p className="truncate text-sm text-white/58">Secure access</p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 items-center justify-center py-8">
            {children}
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (isCanvasEditorRoute) {
    return (
      <main className="relative isolate h-[100dvh] min-h-[100dvh] overflow-x-hidden">
        <GridBackground />

        <div className="mx-auto flex h-full w-full max-w-none flex-col px-0 py-0">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-4 pb-4 pt-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_24px_rgba(140,216,18,0.16)]">
                <ShieldCheck className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                  Decentrathon Admin
                </p>
                <p className="truncate text-sm text-white/58">
                  Canvas workspace
                </p>
              </div>
            </div>

            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:border-red-400/40 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              type="button"
              onClick={() => {
                void handleLogout();
              }}
            >
              <LogOut className="size-3.5" />
              Logout
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-0 sm:px-6 sm:pb-6 lg:px-8">
            {children}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-x-hidden">
      <GridBackground />

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_24px_rgba(140,216,18,0.16)]">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Decentrathon Admin
              </p>
              <p className="truncate text-sm text-white/58">
                Operational control center
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-3 py-2 text-xs text-white/60">
            JWT protected workspace
          </div>

          <nav className="flex flex-wrap items-center gap-2 lg:hidden">
            {NAV_ITEMS.map((item) => {
              const isActive = item.match.test(pathname);
              return (
                <Link
                  key={item.href}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-full border px-3 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    isActive
                      ? "border-primary/35 bg-primary/12 text-primary"
                      : "border-white/10 bg-white/4 text-white/70 hover:border-primary/25 hover:text-white",
                  )}
                  href={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <nav className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:border-red-400/40 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              type="button"
              onClick={() => {
                void handleLogout();
              }}
            >
              <LogOut className="size-3.5" />
              Logout
            </button>
          </nav>
        </header>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:py-8">
          <aside className="hidden lg:block">
            <div className="panel-glow sticky top-6 rounded-[1.75rem] border border-white/10 bg-panel/90 p-4 backdrop-blur-xl">
              <p className="px-2 font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Navigation
              </p>
              <nav className="mt-4 space-y-2">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.match.test(pathname);
                  return (
                    <Link
                      key={item.href}
                      className={cn(
                        "group flex min-h-12 items-center gap-3 rounded-[1.25rem] border px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        isActive
                          ? "border-primary/35 bg-primary/10 text-white"
                          : "border-white/10 bg-black/20 text-white/72 hover:border-primary/25 hover:bg-white/[0.04] hover:text-white",
                      )}
                      href={item.href}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-2xl border",
                          isActive
                            ? "border-primary/25 bg-primary/12 text-primary"
                            : "border-white/10 bg-white/[0.04] text-white/55 group-hover:text-primary/85",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/45">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </main>
  );
}
