import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Company Lens",
  description: "국민연금 사업장 데이터 기반 회사 검색 도구"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            Company Lens
          </a>
          <span>국민연금 기반 회사 검색</span>
        </header>
        {children}
      </body>
    </html>
  );
}
