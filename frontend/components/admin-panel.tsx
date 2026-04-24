import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminPanelProps = {
  as?: "div" | "section";
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function AdminPanel({ as, children, className, ...props }: AdminPanelProps) {
  const Component = as ?? "div";

  return (
    <Component className={cn("admin-panel", className)} {...props}>
      {children}
    </Component>
  );
}
