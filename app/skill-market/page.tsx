import type { Metadata } from "next";
import { MotionStore } from "@/components/motion-store/motion-store";

export const metadata: Metadata = {
  title: "Motion Store",
  description: "Browse robot-ready motion from Agentech.",
  alternates: { canonical: "/skill-market" }
};

export default function SkillMarketPage() {
  return <MotionStore />;
}
