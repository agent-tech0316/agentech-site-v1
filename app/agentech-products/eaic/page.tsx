import type { Metadata } from "next";
import Link from "next/link";
import { EaicPublicExperience } from "@/components/eaic-public-experience";
import { EaicWaveDemo } from "@/components/eaic-wave-demo";
import { eaicHubPath } from "@/lib/eaic-hub";
import "./eaic-public.css";

export const metadata: Metadata = {
  title: "EAIC | Agentech",
  description: "Build, validate, and run robot capabilities through the EAIC developer workspace.",
  alternates: { canonical: "/agentech-products/eaic" },
  openGraph: {
    title: "EAIC | Agentech",
    description: "Build, validate, and run robot capabilities through the EAIC developer workspace.",
    url: "/agentech-products/eaic",
    siteName: "Agentech",
    type: "website"
  }
};

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
}

export default function EaicPublicPage() {
  return (
    <div className="eaic-public-page" data-eaic-public-page>
      <section className="eaic-public-hero" aria-labelledby="eaic-public-title">
        <div className="eaic-public-grid" aria-hidden="true" />
        <div className="eaic-public-shell eaic-public-hero-layout">
          <div className="eaic-public-hero-copy">
            <p className="eaic-public-kicker">EAIC / Build with robots</p>
            <h1 id="eaic-public-title" data-eaic-public-title>Turn your ideas into robot actions.</h1>
            <p className="eaic-public-intro">Make a robot wave, return home, or take a photo. Build and test your code with EAIC, then run it in a reviewed session.</p>
            <div className="eaic-public-actions">
              <Link href={eaicHubPath} data-eaic-public-hub-cta className="eaic-public-button eaic-public-button-primary">Start building <ArrowIcon /></Link>
              <a href="#capabilities" className="eaic-public-button eaic-public-button-secondary">Explore outcomes <ArrowIcon /></a>
            </div>
            <p className="eaic-public-hero-note">Code · SDK reference · safety validation · supervised robot sessions</p>
          </div>
          <EaicWaveDemo />
        </div>
      </section>

      <main>
        <EaicPublicExperience />

        <section className="eaic-public-section eaic-public-shell" aria-labelledby="eaic-public-path-title">
          <div className="eaic-public-section-heading">
            <p className="eaic-public-kicker">From an idea to a reviewed session</p>
            <h2 id="eaic-public-path-title">Build the next move with the real constraints in view.</h2>
          </div>
          <ol className="eaic-public-path">
            <li><span>01</span><h3>Write</h3><p>Start from a documented SDK capability and shape it into your own program.</p></li>
            <li><span>02</span><h3>Validate</h3><p>Review code and declared limits before requesting a robot session.</p></li>
            <li><span>03</span><h3>Run supervised</h3><p>Approved work can progress to scheduling and a supervised live run in the Hub.</p></li>
          </ol>
        </section>

        <section className="eaic-public-section eaic-public-shell" aria-labelledby="eaic-public-safety-title" data-eaic-public-safety-boundary>
          <div className="eaic-public-safety-layout">
            <div><p className="eaic-public-kicker">A real boundary</p><h2 id="eaic-public-safety-title">Validation is evidence, not a physical safety guarantee.</h2></div>
            <div className="eaic-public-safety-copy">
              <p>SDK compatibility, code review, and simulation assess software behavior against the published capability surface. They support a supervised workflow; they do not replace it.</p>
              <p>Offline validation and simulation do not prove physical safety, calibration, live media availability, or a successful robot run.</p>
            </div>
          </div>
        </section>

        <section className="eaic-public-callout">
          <div className="eaic-public-shell eaic-public-callout-layout">
            <div><p className="eaic-public-kicker">For developers</p><h2>Make the next move yours.</h2></div>
            <Link href={eaicHubPath} className="eaic-public-button eaic-public-button-primary">Enter EAIC Hub <ArrowIcon /></Link>
          </div>
        </section>
      </main>
    </div>
  );
}
