type GlowCardProps = {
  eyebrow: string;
  title: string;
};

export function GlowCard({ eyebrow, title }: GlowCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary/30">
      <p className="font-pixel text-[10px] uppercase tracking-[0.22em] text-primary/80">
        {eyebrow}
      </p>
      <p className="mt-4 text-sm leading-6 text-white/70">{title}</p>
    </div>
  );
}
