import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-kr/wght.css";
import "./globals.css";
import Link from "next/link";
import { ScanSearch, Database } from "lucide-react";
import { publicOrigin, siteDescription, socialMetadata } from "@/lib/social-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin),
  ...socialMetadata("Company Lens | 회사 고용·연봉 정보", siteDescription, "/")
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Translation extensions such as Trancy add root attributes before hydration.
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <header className="site-header">
          <Link href="/" className="brand"><ScanSearch size={25} aria-hidden="true" />Company Lens</Link>
          <span className="header-description">기업 고용 데이터</span>
          <span className="header-source"><Database size={14} aria-hidden="true" />국민연금 공개 데이터</span>
        </header>
        {children}
      </body>
    </html>
  );
}
