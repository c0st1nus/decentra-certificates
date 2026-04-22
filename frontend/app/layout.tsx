import clsx from "clsx";
import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { fontMono, fontPixel, fontSans } from "@/config/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Decentrathon Certificates",
    template: "%s | Decentrathon Certificates",
  },
  description: "Certificate issuance platform for Decentrathon participants and organizers.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="dark" lang="en">
      <body
        className={clsx(
          "min-h-screen bg-background text-foreground antialiased",
          fontSans.variable,
          fontMono.variable,
          fontPixel.variable,
        )}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
