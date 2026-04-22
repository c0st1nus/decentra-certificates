type GlowCardProps = {
  eyebrow: string;
  title: string;
};

export function GlowCard({ eyebrow, title }: GlowCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary/30">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">
        {eyebrow}
      </p>
      <p className="mt-4 text-sm leading-6 text-white/75">{title}</p>
    </div>
  );
}
