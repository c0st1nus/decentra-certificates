"use client";

import { BadgeCheck, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { GridBackground } from "@/components/grid-background";
import { adminLogout, getAdminSession, hasAdminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isCanvasEditorRoute = /^\/admin\/templates\/[^/]+\/layout$/.test(pathname);

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

          <div className="flex flex-1 items-center justify-center py-8">{children}</div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main
      className={cn(
        "relative isolate min-h-screen overflow-x-hidden",
        isCanvasEditorRoute && "h-[100dvh] min-h-[100dvh]",
      )}
    >
      <GridBackground />

      <div
        className={cn(
          "mx-auto flex min-h-screen w-full flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8",
          isCanvasEditorRoute
            ? "h-full min-h-0 max-w-none px-0 py-0 sm:px-0 sm:py-0 lg:px-0"
            : "max-w-7xl",
        )}
      >
        <header
          className={cn(
            "flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4",
            isCanvasEditorRoute && "px-4 pb-4 pt-4 sm:px-6 lg:px-8",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_24px_rgba(140,216,18,0.16)]">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
                Decentrathon Admin
              </p>
              <p className="truncate text-sm text-white/58">Operational control center</p>
            </div>
          </div>

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

        <div
          className={cn(
            "flex-1 py-6 sm:py-8",
            isCanvasEditorRoute && "flex min-h-0 flex-col overflow-hidden px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0 lg:px-8",
          )}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
