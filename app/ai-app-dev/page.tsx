import type { Metadata } from "next";
import Link from "next/link";
import { AppDevelopmentPreview } from "@/components/app-development-preview";
import "../ai-website/website-launch.css";
import "../ai-service/ai-services.css";

export const metadata: Metadata = {
  title: "AI App Development — Coming Soon",
  description: "Agentech’s app development service is in development. Explore AI Services or our available Website Launch Package.",
  alternates: { canonical: "/ai-app-dev" }
};

export default function AIAppDevelopmentPage() {
  return (
    <div className="website-launch" data-ai-services>
      <div className="wl-wrap">
        <nav className="ais-breadcrumb" aria-label="Breadcrumb"><Link href="/ai-service">AI Services</Link><span aria-hidden="true">/</span><span aria-current="page">AI App Development</span></nav>
        <section className="ais-app-hero" aria-labelledby="app-development-heading">
          <div>
            <p className="wl-eyebrow">AI-DEVELOPMENT / APPLICATIONS</p>
            <span className="ais-status">Coming soon</span>
            <h1 id="app-development-heading">AI App<br />Development</h1>
            <p className="wl-intro">A new chapter is taking shape.</p>
            <p className="ais-app-description">We’re preparing our dedicated app development service. Details on scope, pricing, and availability will follow here.</p>
            <div className="wl-actions"><Link href="/ai-service" className="wl-button wl-button-primary">Explore AI Services <span aria-hidden="true">↗</span></Link></div>
          </div>
          <div className="ais-app-preview ais-app-hero-visual"><AppDevelopmentPreview /></div>
        </section>
        <aside className="ais-agency">
          <div><p className="wl-eyebrow">AVAILABLE TODAY</p><h2>Ready to launch your website?</h2></div>
          <Link href="/ai-website">Explore AI Website <span aria-hidden="true">↗</span></Link>
        </aside>
      </div>
    </div>
  );
}
