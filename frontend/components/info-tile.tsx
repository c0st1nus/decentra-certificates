import { cn } from "@/lib/utils";

type InfoTileProps = {
  label: string;
  value: string;
  valueClassName?: string;
};

export function InfoTile({ label, value, valueClassName }: InfoTileProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className={cn("mt-2 truncate text-sm text-white/75", valueClassName)}>{value}</p>
    </div>
  );
}
