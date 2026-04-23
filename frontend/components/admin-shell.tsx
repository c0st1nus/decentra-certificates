"use client";

import { BadgeCheck, Layers3, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { GridBackground } from "@/components/grid-background";
import { useAuth } from "@/hooks/use-auth";
import { adminLogout } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "System overview",
    icon: LayoutDashboard,
    match: /^\/admin$/,
  },
  {
    href: "/admin/templates",
    label: "Templates",
    description: "Assets, layout, variants",
    icon: Layers3,
    match: /^\/admin\/templates(\/.*)?$/,
  },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const isCanvasEditorRoute = /^\/admin\/templates\/[^/]+\/layout$/.test(pathname);

  useEffect(() => {
    if (isLoading) return;

    if (pathname === "/admin/login") {
      if (isAuthenticated) {
        router.replace("/admin");
      }
      return;
    }

    if (!isAuthenticated) {
      router.replace("/admin/login");
    }
  }, [pathname, router, isAuthenticated, isLoading]);

  async function handleLogout() {
    await adminLogout();
    logout();
  }

  if (isLoading) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <GridBackground />
        <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
          <div className="rounded-2xl border border-white/10 bg-panel/90 px-6 py-5 text-sm text-white/70 backdrop-blur-xl">
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
          <div className="flex flex-1 items-center justify-center py-8">{children}</div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (isCanvasEditorRoute) {
    return <main className="h-screen w-screen overflow-hidden bg-[#0a0a12] p-3">{children}</main>;
  }

  return (
    <main className="relative isolate min-h-screen overflow-x-hidden">
      <GridBackground />

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
