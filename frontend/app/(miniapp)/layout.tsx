import { PublicMobileNav } from "@/components/public-mobile-nav";

export default function MiniappLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-0">{children}</div>
      <PublicMobileNav />
    </>
  );
}
