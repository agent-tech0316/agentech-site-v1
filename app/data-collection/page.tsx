import type { Metadata } from "next";
import { DataCollectionLanding } from "@/components/data-collection/landing";

export const metadata: Metadata = {
  title: "Data Collection for Physical AI",
  description: "Define and source the real-world data your model needs. Explore collection scenarios and build a custom data brief with Agentech.",
  alternates: { canonical: "/data-collection" }
};
export default function DataCollectionPage() {
  return <DataCollectionLanding localPreview={process.env.NODE_ENV === "development"} />;
}
