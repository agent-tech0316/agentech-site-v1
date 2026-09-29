import type { Metadata } from "next";
import Link from "next/link";
import { WebsiteConceptPreview } from "@/components/website-concept-preview";
import { AppDevelopmentPreview } from "@/components/app-development-preview";
import "../ai-website/website-launch.css";
import "./ai-services.css";

export const metadata: Metadata = {
  title: "AI Services — Websites & App Development",
  description: "Explore Agentech’s AI development services. Launch your business website with a clear scope and fixed price. App development is coming soon.",
  alternates: { canonical: "/ai-service" }
};

export default function AIServicePage() {
  return (
    <div className="website-launch" data-ai-services>
      <div className="wl-wrap">
        <header className="ais-heading">
          <p className="wl-eyebrow">SERVICE / AI-DEVELOPMENT</p>
          <h1>AI Services</h1>
          <p>Websites for your next chapter.<br />Applications for what comes next.</p>
          <Link className="ais-card-link" href={`/account/service-profiles?type=development-client${process.env.NODE_ENV === "development" ? "&preview=1" : ""}`}>Your app / website client profile <span aria-hidden="true">↗</span></Link>
        </header>
        <section className="ais-offerings" aria-label="AI development services">
          <article className="ais-card" data-ai-offering="website">
            <Link href="/ai-website" className="ais-preview ais-website-preview" aria-label="Explore AI Website">
              <div className="ais-browser"><div className="ais-browser-bar"><span aria-hidden="true">● ● ●</span><span>FIELDWORK / CONCEPT WEBSITE</span></div><WebsiteConceptPreview /></div>
            </Link>
            <div className="ais-card-content">
              <div className="ais-card-label"><span>01 / WEB</span><span className="ais-status ais-status-available">Available now</span></div>
              <h2>AI Website</h2>
              <p>A considered website for your business. Design, development, and handoff in one focused package.</p>
              <div className="ais-card-facts"><strong>$2,000 <small>USD</small></strong><span>1–5 pages</span><span>Two revision rounds</span></div>
              <Link href="/ai-website" className="ais-card-link">Explore website development <span aria-hidden="true">↗</span></Link>
            </div>
          </article>
          <article className="ais-card" data-ai-offering="app">
            <Link href="/ai-app-dev" className="ais-preview ais-app-preview" aria-label="Explore AI App Development"><AppDevelopmentPreview /></Link>
            <div className="ais-card-content">
              <div className="ais-card-label"><span>02 / APP</span><span className="ais-status">Coming soon</span></div>
              <h2>AI App Development</h2>
              <p>The next part of our development offering. We’re preparing a dedicated service for applications.</p>
              <div className="ais-card-facts"><span>Service in development</span></div>
              <Link href="/ai-app-dev" className="ais-card-link">Explore app development <span aria-hidden="true">↗</span></Link>
            </div>
          </article>
        </section>
        <aside className="ais-agency">
          <div><p className="wl-eyebrow">FOR DESIGN & MARKETING AGENCIES</p><h2>Your client. Your brand. Our build.</h2></div>
          <Link href="/ai-website#agency-partners">Explore agency website delivery <span aria-hidden="true">↗</span></Link>
        </aside>
      </div>
    </div>
  );
}
