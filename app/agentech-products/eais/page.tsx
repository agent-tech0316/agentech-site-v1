import type { Metadata } from "next";
import { EaisShowcase } from "@/components/eais-showcase";

export const metadata: Metadata = {
  title: "EAIS | Agentech Works",
  description: "A public discovery index for Agentech-related robotics, AI systems, education, and experimental work.",
  alternates: { canonical: "/agentech-products/eais" },
  openGraph: {
    title: "EAIS | Agentech Works",
    description: "A public discovery index for Agentech-related robotics, AI systems, education, and experimental work.",
    url: "/agentech-products/eais",
    siteName: "Agentech",
    type: "website"
  }
};

export default function EaisPage() {
  return <EaisShowcase />;
}
