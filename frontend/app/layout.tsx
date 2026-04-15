import clsx from "clsx";
import type { Metadata, Viewport } from "next";

import { fontMono, fontPixel, fontSans } from "@/config/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Decentrathon Certificates",
    template: "%s | Decentrathon Certificates",
  },
  description: "Платформа выдачи сертификатов для участников и организаторов Decentrathon.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="dark" lang="ru">
      <body
        className={clsx(
          "min-h-screen bg-background text-foreground antialiased",
          fontSans.variable,
          fontMono.variable,
          fontPixel.variable,
        )}
      >
        {children}
      </body>
    </html>
  );
}
