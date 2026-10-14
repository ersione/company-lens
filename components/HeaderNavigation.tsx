"use client";

import { Navigation, NavigationLink } from "@ersione/design-system/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ChartNoAxesCombined, TrendingUpDown, Layers3, MapPin, GitCompareArrows } from "lucide-react";

const items = [
  { href: "/", label: "회사 검색", icon: Search },
  { href: "/statistics", label: "고용 동향", icon: ChartNoAxesCombined },
  { href: "/employment-trends", label: "고용 변화", icon: TrendingUpDown },
  { href: "/industries", label: "업종별", icon: Layers3 },
  { href: "/regions", label: "지역별", icon: MapPin },
  { href: "/compare", label: "사업장 비교", icon: GitCompareArrows }
];

export function HeaderNavigation() {
  const pathname = usePathname();
  return <Navigation className="header-navigation" aria-label="주 메뉴">
    {items.map(({ href, label, icon: Icon }) => {
      const active = href === "/"
        ? pathname === "/" || pathname.startsWith("/companies/")
        : pathname === href || pathname.startsWith(`${href}/`);
      return <NavigationLink as={Link} key={href} href={href} active={active} icon={<Icon aria-hidden="true" />}>{label}</NavigationLink>;
    })}
  </Navigation>;
}
