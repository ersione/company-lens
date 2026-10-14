import { StatisticsGroupsPage } from "@/components/StatisticsGroupsPage";
import { socialMetadata } from "@/lib/social-metadata";
export const dynamic = "force-dynamic";
export const metadata = socialMetadata("지역별 현황 | Company Lens", "전국 시도별 국민연금 가입 사업장 수, 가입자 수와 추정 급여의 월별 추이입니다.", "/regions");
export default function RegionsPage() { return <StatisticsGroupsPage dimension="region" />; }
