import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-kr/wght.css";
import "./globals.css";
import "@ersione/design-system/styles.css";
import "./design-system.css";
import Image from "next/image";
import ersioneSymbol from "@ersione/design-system/symbol.svg";
import Link from "next/link";
import { Database } from "lucide-react";
import { publicOrigin, siteTitle, siteDescription, socialMetadata } from "@/lib/social-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin),
  ...socialMetadata(siteTitle, siteDescription, "/")
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Translation extensions such as Trancy add root attributes before hydration.
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="eds-theme" data-brand="blue" data-dark="false">
        <header className="site-header site-header-navigation">
          <Link href="/" className="brand"><Image src={ersioneSymbol} alt="" width={30} height={30} /><span>Company Lens</span></Link>
          <nav className="header-navigation" aria-label="주 메뉴">
            <Link href="/">회사 검색</Link><Link href="/statistics">고용 동향</Link>
            <Link href="/employment-trends">고용 변화</Link>
            <Link href="/industries">업종별</Link><Link href="/regions">지역별</Link>
            <Link href="/compare">사업장 비교</Link>
          </nav>
          <span className="header-source"><Database size={14} aria-hidden="true" />국민연금 공개 데이터</span>
        </header>
        {children}
      </body>
    </html>
  );
}
