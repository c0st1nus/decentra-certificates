"use client";

import { useTelegram } from "@/components/telegram-provider";

interface CertificateDownloadButtonProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function CertificateDownloadButton({
  href,
  className,
  children,
}: CertificateDownloadButtonProps) {
  const { isTma, openLink } = useTelegram();

  if (isTma) {
    return (
      <button className={className} type="button" onClick={() => openLink(buildInlineHref(href))}>
        {children}
      </button>
    );
  }

  return (
    <a className={className} download href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

function buildInlineHref(href: string) {
  const url = new URL(href, window.location.href);
  url.searchParams.set("disposition", "inline");
  return url.toString();
}
