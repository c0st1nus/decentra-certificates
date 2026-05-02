import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function AdminBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center gap-2 rounded-full px-1 text-sm text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      href={href}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
