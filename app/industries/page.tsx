import { StatisticsGroupsPage } from "@/components/StatisticsGroupsPage";
import { socialMetadata } from "@/lib/social-metadata";
export const dynamic = "force-dynamic";
export const metadata = socialMetadata("업종별 현황 | Company Lens", "국민연금 공개 데이터로 업종별 가입 사업장, 가입자 수와 추정 급여 추이를 확인합니다.", "/industries");
export default async function IndustriesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return <StatisticsGroupsPage dimension="industry" requestedPage={(await searchParams).page} />;
}
