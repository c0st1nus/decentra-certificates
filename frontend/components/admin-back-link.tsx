import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function AdminBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
      href={href}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
