import { notFound } from "next/navigation";
import { StatisticsDetail } from "@/components/StatisticsView";
import { resolveStatisticsHistory, statisticsHref } from "@/lib/public-statistics";
import { socialMetadata } from "@/lib/social-metadata";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ key: string }> };
export async function generateMetadata({ params }: Props) {
  const { key } = resolveStatisticsHistory("region", (await params).key);
  return socialMetadata(`${key} 고용 현황 | Company Lens`, `${key}의 사업장 수, 국민연금 가입자 수와 추정 급여의 월별 변화.`, statisticsHref("region", key));
}
export default async function RegionPage({ params }: Props) {
  const { key, history } = resolveStatisticsHistory("region", (await params).key);
  if (!history.length) notFound();
  return <StatisticsDetail title={key} dimension="region" history={history} />;
}
