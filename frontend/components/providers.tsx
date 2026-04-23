"use client";

import { Toaster } from "sonner";

import { TelegramProvider } from "@/components/telegram-provider";
import { AuthProvider } from "@/hooks/use-auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TelegramProvider>
      <AuthProvider>
        {children}
        <Toaster
          position="top-right"
          richColors
          theme="dark"
          toastOptions={{
            style: {
              background: "#0d0d13",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#f4f4f5",
            },
          }}
        />
      </AuthProvider>
    </TelegramProvider>
  );
}
