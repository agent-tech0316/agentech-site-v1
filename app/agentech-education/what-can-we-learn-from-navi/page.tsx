import type { ResolvingMetadata } from "next";
import { NaviLearningPage } from "@/components/navi-learning-page";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata) {
  return resolvePublicPageMetadata("/agentech-education/what-can-we-learn-from-navi", parent, {
    title: "What Can We Learn from Navi? | Agentech Education",
    description:
      "A playful Agentech Education guide showing how young AI natives can learn coding, robotics, creativity, and AI skill graphs with Navi."
  });
}

export default function WhatCanWeLearnFromNaviPage() {
  return <NaviLearningPage />;
}
