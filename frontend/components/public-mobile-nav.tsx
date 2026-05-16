"use client";

import clsx from "clsx";
import { BadgeCheck, Gamepad2, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  icon: typeof BadgeCheck;
  isActive: (pathname: string) => boolean;
};

const tabs: Tab[] = [
  {
    href: "/",
    label: "Серты",
    icon: BadgeCheck,
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/game",
    label: "Тетрис",
    icon: Gamepad2,
    isActive: (pathname) =>
      pathname.startsWith("/game") && !pathname.startsWith("/game/leaderboard"),
  },
  {
    href: "/game/leaderboard",
    label: "Борд",
    icon: Trophy,
    isActive: (pathname) => pathname.startsWith("/game/leaderboard"),
  },
];

export function PublicMobileNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-panel/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1">
        {tabs.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);

          return (
            <Link
              key={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-2 py-1.5 text-[11px] font-semibold tracking-tight transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-white/55 hover:text-white/80",
              )}
              href={href}
              prefetch
            >
              <Icon
                aria-hidden
                className={clsx("size-5 shrink-0", active ? "text-primary" : "text-white/50")}
                strokeWidth={active ? 2.25 : 2}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
