import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account-dashboard";
import { EaicTaskCard } from "@/features/eaic/01-clients/eaic-hub/components/eaic-task-card";
import { EaicTaskHeader } from "@/features/eaic/01-clients/eaic-hub/components/eaic-task-header";
import { getEaicHubTaskPath } from "@/lib/eaic-hub";
import "./schedule-time.css";

export const metadata: Metadata = {
  title: "Schedule Robot Time | EAIC HUB",
  description: "Choose a time and duration for an Agentech supervised robot viewing session."
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
        title="Schedule Robot Time"
        description="Choose the run type, available start time, and viewing duration for the supervised session."
        eyebrow="Robot scheduling"
        fallbackHref={getEaicHubTaskPath("watch-live-run")}
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
