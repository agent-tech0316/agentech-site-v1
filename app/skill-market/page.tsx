import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Skill Market — Coming Soon",
  description: "The Agentech Skill Market is coming soon.",
  alternates: { canonical: "/skill-market" }
};

export default function SkillMarketPage() {
  return <PlaceholderPage title="SKILL MARKET" />;
}
