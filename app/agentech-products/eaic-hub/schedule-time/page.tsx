import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account-dashboard";

export const metadata: Metadata = {
  title: "Schedule Robot Time | EAIC HUB",
  description: "Choose a time and duration for an Agentech supervised robot viewing session."
};

export default async function ScheduleRobotTimePage({searchParams}: {searchParams:Promise<{nativeAssetId?: string}>}) {
  const {nativeAssetId} = await searchParams;
  return (
    <main className="account-white-page min-h-screen bg-[#f6f8fc] px-4 py-8 text-slate-950 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <AccountDashboard mode="robot-scheduling" nativeAssetId={nativeAssetId} />
      </div>
    </main>
  );
}
