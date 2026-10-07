import { redirect } from "next/navigation";

import { getStudyContextForCurrentUser } from "@/composition/study";
import {
  getTodayDashboard,
  type GetTodayDashboardResult,
} from "@/modules/study/application/today-dashboard";
import { StudyError } from "@/modules/study/application/study-error";

import { DashboardError } from "./dashboard-error";
import { DashboardView } from "./dashboard-view";

export async function DashboardContent({
  courseId,
  locale,
  deckQuery,
}: {
  courseId: string;
  locale: string;
  deckQuery: unknown;
}) {
  const context = await getStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  let result: GetTodayDashboardResult | null = null;
  try {
    result = await getTodayDashboard(
      context.dailyQueue,
      context.todayOverview,
      context.todayDashboard,
      {
        ownerId: context.ownerId,
        courseId,
        now: context.clock.now(),
        timeZone: context.timeZone,
        deckQuery,
      },
    );
  } catch (error) {
    if (!(error instanceof StudyError)) throw error;
    console.error("Today dashboard read failed", error.kind);
  }
  if (!result) return <DashboardError />;
  if (!result.ok) return <DashboardError invalidFilter={result.reason === "invalid-filter"} />;
  return <DashboardView dashboard={result.dashboard} timeZone={context.timeZone} />;
}
