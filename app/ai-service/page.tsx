import type { Metadata } from "next";
import Link from "next/link";
import { WebsiteConceptPreview } from "@/components/website-concept-preview";
import "../ai-website/website-launch.css";

export const metadata: Metadata = {
  title: "AI Development Services",
  description: "Focused digital projects, built with AI and reviewed by people. Explore Agentech’s Website Launch Package.",
  alternates: { canonical: "/ai-service" }
};

export default function AIServicePage() {
  return <div className="website-launch"><div className="wl-wrap wl-overview"><p className="wl-eyebrow">SERVICE / AI-DEVELOPMENT</p><h1>From your next idea<br />to something <span>real.</span></h1><p className="wl-intro">Focused digital services from Agentech. A clear scope, a responsible team, and work that is reviewed by people at every step.</p><article className="wl-service-feature"><div><span className="wl-tag">WEBSITE DEVELOPMENT</span><h2>A better place<br />for your business.</h2><p>The Website Launch Package brings together design, development, testing, and handoff for a focused 1–5 page website.</p><p><strong>$2,000 USD</strong> · Two revision rounds · 30-day bug support</p><Link href="/ai-website" className="wl-button wl-button-primary">Explore AI-WEBSITE ↗</Link></div><WebsiteConceptPreview /></article><div className="wl-overview-links"><Link href="/ai-website#agency-partners">Website delivery for agencies ↗</Link><Link href="/ai-website#showcase">Explore our concept websites ↗</Link><Link href="/ai-website#inquiry">Discuss a project ↗</Link></div></div></div>;
}
