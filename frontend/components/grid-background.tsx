export function GridBackground() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(140,216,18,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(140,216,18,0.045)_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_85%_60%_at_50%_0%,black_38%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(102,43,177,0.22),transparent_30%)]" />
    </>
  );
}
