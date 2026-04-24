import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

type TemplateStatLinkCardProps = {
  count: string;
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle: string;
};

export function TemplateStatLinkCard({
  count,
  href,
  icon: Icon,
  label,
  subtitle,
}: TemplateStatLinkCardProps) {
  return (
    <Link
      className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-panel/90 p-5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/[0.04]"
      href={href}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <Icon aria-hidden="true" className="size-4 text-primary" />
        </div>
        <div>
          <p className="admin-eyebrow">{label}</p>
          <p className="text-sm font-medium text-white/85">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-black text-white">{count}</span>
        <ArrowRight
          aria-hidden="true"
          className="size-5 text-primary/85 transition group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}
