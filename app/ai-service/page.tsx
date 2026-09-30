import type { Metadata } from "next";
import Link from "next/link";
import { AppDevelopmentPreview } from "@/components/app-development-preview";
import { WebsiteConceptPreview } from "@/components/website-concept-preview";
import referenceStyles from "../agentech-products/eais/eais-showcase.module.css";
import "../ai-website/website-launch.css";
import "./ai-services.css";

export const metadata: Metadata = {
  title: "AI Services — Websites & App Development",
  description: "Explore Agentech’s AI development services. Launch your business website with a clear scope and fixed price. App development is coming soon.",
  alternates: { canonical: "/ai-service" }
};

const clientProfileHref = `/account/service-profiles?type=development-client${process.env.NODE_ENV === "development" ? "&preview=1" : ""}`;

export default function AIServicePage() {
  return (
    <div className={`website-launch ${referenceStyles.page} ais-product-system`} data-ai-services>
      <aside className={referenceStyles.sidebar} aria-label="AI Services sections">
        <Link className={referenceStyles.wordmark} href="/ai-service" aria-label="AI Services overview">
          <span>AGENTECH</span>
          <strong>AIS</strong>
        </Link>
        <p className={referenceStyles.sideLabel}>AI DEVELOPMENT</p>
        <nav className={referenceStyles.navigation}>
          <a href="#services">Services <span aria-hidden="true">↘</span></a>
          <a href="#agency">Agency delivery <span aria-hidden="true">↘</span></a>
          <Link href={clientProfileHref}>Client profile <span aria-hidden="true">↗</span></Link>
        </nav>
        <p className={referenceStyles.sideNote}>Websites for your next chapter. Applications for what comes next.</p>
      </aside>

      <main className={referenceStyles.content}>
        <details className={referenceStyles.mobileNavigation}>
          <summary>Explore AI Services <span aria-hidden="true">＋</span></summary>
          <nav>
            <a href="#services">Services</a>
            <a href="#agency">Agency delivery</a>
            <Link href={clientProfileHref}>Client profile</Link>
          </nav>
        </details>

        <div className={referenceStyles.topBar}>
          <p className={referenceStyles.previewLabel}>SERVICE / <span>AI DEVELOPMENT</span></p>
          <Link className={referenceStyles.primaryAction} href={clientProfileHref}>
            Your app / website client profile <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <header className="ais-intro">
          <p className={referenceStyles.eyebrow}>WEBSITES &amp; APPLICATIONS</p>
          <h1>AI Services</h1>
          <p>Websites for your next chapter.<br />Applications for what comes next.</p>
        </header>

        <section id="services" className={`${referenceStyles.featured} ais-services-section`} aria-label="AI development services">
          <div className={referenceStyles.sectionHeader}>
            <div>
              <p className={referenceStyles.eyebrow}>01 / SERVICES</p>
              <h2>Build what comes next.</h2>
            </div>
            <p>Two focused services for bringing a clear digital product into the world.</p>
          </div>

          <div className="ais-offerings">
            <article className={`${referenceStyles.featureCard} ais-card`} data-ai-offering="website">
              <Link href="/ai-website" className={`${referenceStyles.featureImage} ais-preview ais-website-preview`} aria-label="Explore AI Website">
                <div className="ais-browser">
                  <div className="ais-browser-bar"><span aria-hidden="true">● ● ●</span><span>FIELDWORK / CONCEPT WEBSITE</span></div>
                  <WebsiteConceptPreview />
                </div>
              </Link>
              <div className={`${referenceStyles.featureCardCopy} ais-card-content`}>
                <small className="ais-card-label"><span>01 / WEB</span><span className="ais-status ais-status-available">Available now</span></small>
                <h3><strong>AI Website</strong></h3>
                <em>A considered website for your business. Design, development, and handoff in one focused package.</em>
                <div className="ais-card-facts"><strong>$2,000 <small>USD</small></strong><span>1–5 pages</span><span>Two revision rounds</span></div>
                <Link href="/ai-website" className="ais-card-action"><b>Explore website development <span aria-hidden="true">↗</span></b></Link>
              </div>
            </article>

            <article className={`${referenceStyles.featureCard} ais-card`} data-ai-offering="app">
              <Link href="/ai-app-dev" className={`${referenceStyles.featureImage} ais-preview ais-app-preview`} aria-label="Explore AI App Development">
                <AppDevelopmentPreview />
              </Link>
              <div className={`${referenceStyles.featureCardCopy} ais-card-content`}>
                <small className="ais-card-label"><span>02 / APP</span><span className="ais-status">Coming soon</span></small>
                <h3><strong>AI App Development</strong></h3>
                <em>The next part of our development offering. We’re preparing a dedicated service for applications.</em>
                <div className="ais-card-facts"><span>Service in development</span></div>
                <Link href="/ai-app-dev" className="ais-card-action"><b>Explore app development <span aria-hidden="true">↗</span></b></Link>
              </div>
            </article>
          </div>
        </section>

        <section id="agency" className={`${referenceStyles.process} ais-agency`}>
          <div className={referenceStyles.sectionHeader}>
            <div>
              <p className={referenceStyles.eyebrow}>02 / AGENCY DELIVERY</p>
              <h2>Built for your client.</h2>
            </div>
          </div>
          <div className={`${referenceStyles.processGrid} ais-agency-grid`}>
            <article>
              <span>FOR DESIGN &amp; MARKETING AGENCIES</span>
              <h3>Your client. Your brand. Our build.</h3>
              <Link href="/ai-website#agency-partners" className="ais-agency-action">Explore agency website delivery <span aria-hidden="true">↗</span></Link>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
