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
      <button className={className} type="button" onClick={() => openLink(href)}>
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
