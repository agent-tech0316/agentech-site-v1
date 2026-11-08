import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account-dashboard";
import { EaicTaskCard } from "@/features/eaic/01-clients/eaic-hub/components/eaic-task-card";
import { EaicTaskHeader } from "@/features/eaic/01-clients/eaic-hub/components/eaic-task-header";
import { getEaicHubTaskPath } from "@/lib/eaic-hub";
import { scheduleTimeTask } from "@/lib/agentech-library-tasks";
import "./schedule-time.css";

export const metadata: Metadata = {
  title: `${scheduleTimeTask.title} | EAIC HUB`,
  description: scheduleTimeTask.summary
};

export default async function ScheduleRobotTimePage({
  searchParams,
}: {
  searchParams: Promise<{ nativeAssetId?: string }>;
}) {
  const { nativeAssetId } = await searchParams;
  return (
    <div className="agentech-library-page eaic-task-theme min-h-screen bg-[#f5f4f1] text-[#111111]">
      <EaicTaskHeader
        task={scheduleTimeTask}
        fallbackHref={getEaicHubTaskPath("software-check")}
      />
      <div className="px-4 py-10 sm:px-6 lg:px-8">
        <div data-eaic-schedule className="mx-auto max-w-6xl">
          <EaicTaskCard>
            <AccountDashboard mode="robot-scheduling" nativeAssetId={nativeAssetId} />
          </EaicTaskCard>
        </div>
      </div>
    </div>
  );
}
