import { AdminBackLink } from "@/components/admin-back-link";

type AdminPageHeaderProps = {
  backHref?: string;
  backLabel?: string;
  description: string;
  title: string;
};

export function AdminPageHeader({
  backHref,
  backLabel = "Назад",
  description,
  title,
}: AdminPageHeaderProps) {
  return (
    <div className="max-w-3xl space-y-4">
      {backHref ? <AdminBackLink href={backHref} label={backLabel} /> : null}
      <h1 className="heading-hero text-gradient text-left">{title}</h1>
      <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">{description}</p>
    </div>
  );
}
