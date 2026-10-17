import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-kr/wght.css";
import "./globals.css";
import "@ersione/design-system/styles.css";
import "./design-system.css";
import Image from "next/image";
import ersioneSymbol from "@ersione/design-system/symbol.svg";
import Link from "next/link";
import { HeaderNavigation } from "@/components/HeaderNavigation";
import { Database } from "lucide-react";
import { publicOrigin, siteTitle, siteDescription, socialMetadata } from "@/lib/social-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin),
  ...socialMetadata(siteTitle, siteDescription, "/"),
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" }
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Translation extensions such as Trancy add root attributes before hydration.
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="eds-theme" data-brand="blue" data-dark="false">
        <header className="site-header site-header-navigation">
          <Link href="/" className="brand"><Image src={ersioneSymbol} alt="" width={30} height={30} /><span>Company Lens</span></Link>
          <HeaderNavigation />
          <span className="header-source"><Database size={14} aria-hidden="true" />국민연금 공개 데이터</span>
        </header>
        {children}
      </body>
    </html>
  );
}
