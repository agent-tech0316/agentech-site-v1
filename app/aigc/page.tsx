import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./aigc.css";

export const metadata: Metadata = {
  title: "AIGC — Artificial Intelligence Generated Content",
  description: "A new creative space at Agentech. Explore Artificial Intelligence Generated Content.",
  alternates: { canonical: "/aigc" }
};

const creativeStages = [
  { id: "asset", number: "01", title: "Asset", description: "The starting point. Individual assets and creative elements.", icon: "asset" },
  { id: "asset-movement", number: "02", title: "Asset Movement", description: "The next step. Bringing individual assets into motion.", icon: "movement" },
  { id: "full-animation", number: "03", title: "Full Animation", description: "The complete picture. Assets and movement brought together.", icon: "animation" }
] as const;

function StageIllustration({ type }: { type: typeof creativeStages[number]["icon"] }) {
  return <svg viewBox="0 0 120 100" fill="none" aria-hidden="true" className="aigc-stage-illustration">
    {type === "asset" ? <g stroke="currentColor" strokeWidth="1.4"><path d="m60 17 30 17v34L60 85 30 68V34l30-17Z" /><path d="m30 34 30 18 30-18M60 52v33" /><path d="m44 26 31 17" opacity=".35" /></g>
      : type === "movement" ? <g stroke="currentColor" strokeWidth="1.4"><path d="M11 72c23 0 15-42 47-42h43" strokeDasharray="3 5" opacity=".45" /><path d="m88 21 13 9-13 9" /><rect x="45" y="41" width="30" height="30" rx="4" transform="rotate(-15 60 56)" /><path d="M18 47h14M15 56h14M18 65h14" opacity=".5" /></g>
      : <g stroke="currentColor" strokeWidth="1.4"><rect x="16" y="23" width="88" height="54" rx="5" /><path d="M16 34h88M16 66h88M30 23v11m15-11v11m15-11v11m15-11v11m15-11v11M30 66v11m15-11v11m15-11v11m15-11v11m15-11v11" opacity=".45" /><path d="m54 41 16 9-16 9V41Z" /></g>}
  </svg>;
}

export default function AIGCPage() {
  return (
    <div data-aigc-page>
      <section className="aigc-hero-shell" data-aigc-hero aria-labelledby="aigc-title">
        <div className="aigc-hero-grid" data-aigc-hero-grid aria-hidden="true" />
        <div className="aigc-hero-content" data-aigc-hero-content>
          <div className="aigc-topline">
            <span>AGENTECH / CREATIVE SERVICES</span>
            <span className="aigc-status"><span aria-hidden="true" /> IN DEVELOPMENT</span>
          </div>
          <div className="aigc-hero">
            <div className="aigc-intro">
              <p className="aigc-eyebrow">ARTIFICIAL INTELLIGENCE<br />GENERATED CONTENT</p>
              <h1 id="aigc-title">AIGC<span aria-hidden="true">.</span></h1>
              <h2>Creativity,<br /><em>reimagined.</em></h2>
              <p className="aigc-description">A new space for ideas to take shape.<br />Human imagination. AI-powered creation.</p>
              <div className="aigc-note">
                <span className="aigc-note-mark" aria-hidden="true">↗</span>
                <div><strong>Something new is taking shape.</strong><p>Our creative services are in development.<br />More details are on the way.</p></div>
              </div>
              <Link className="aigc-back" href="/ai-service">Explore AI development <span aria-hidden="true">→</span></Link>
            </div>
            <figure className="aigc-art" data-aigc-art data-aigc-hero-visual>
              <Image src="/assets/aigc/aigc-golf-robot-hero.png" alt="Wireframe humanoid robot progressing through a golf swing with an orange motion trajectory." fill priority sizes="(max-width: 760px) 100vw, 64vw" />
            </figure>
          </div>
        </div>
      </section>
      <div className="aigc-wrap aigc-content-wrap">
        <nav className="aigc-stage-nav" aria-label="AIGC content sections">
          {creativeStages.map((stage) => <a key={stage.id} href={`#${stage.id}`}><span>{stage.number}</span>{stage.title}<span aria-hidden="true">↘</span></a>)}
        </nav>
        <div className="aigc-stages-heading"><p className="aigc-eyebrow">FROM IDEA TO ANIMATION</p><h2>Three stages.<br />One creative journey.</h2><p>Explore each stage below.<br />Content and examples are coming soon.</p></div>
        <div className="aigc-stages" data-aigc-sections>
          {creativeStages.map((stage) => <section key={stage.id} id={stage.id} className="aigc-stage" aria-labelledby={`${stage.id}-title`}>
            <div className="aigc-stage-meta"><span>{stage.number} / AIGC</span><span>COMING SOON</span></div>
            <h3 id={`${stage.id}-title`}>{stage.title}</h3>
            <p>{stage.description}</p>
            <div className={`aigc-stage-placeholder${stage.icon === "asset" ? " aigc-stage-placeholder--art" : stage.icon === "animation" ? " aigc-stage-placeholder--video" : ""}`} data-aigc-placeholder={stage.icon}>
              {stage.icon === "asset"
                ? <div className="aigc-blueprint-composition">
                    <Image className="aigc-blueprint-background" src="/assets/aigc/master-humanoid-blueprint.jpg" alt="" aria-hidden="true" width={1110} height={1417} sizes="(max-width: 760px) calc(100vw - 88px), 28vw" />
                    <Image className="aigc-blueprint-robot" src="/assets/aigc/master-humanoid-blueprint.jpg" alt="Master humanoid robot blueprint with front, side, back, and component studies." width={1110} height={1417} sizes="(max-width: 760px) calc(100vw - 88px), 28vw" />
                    <div className="aigc-blueprint-detail" aria-hidden="true">
                      <Image src="/assets/aigc/master-humanoid-blueprint.jpg" alt="" width={1110} height={1417} sizes="12vw" />
                    </div>
                  </div>
                : stage.icon === "animation"
                  ? <video src="/assets/aigc/full-animation-showcase.mp4" aria-label="Full animation showcase" autoPlay loop muted playsInline controls preload="metadata" />
                  : <><StageIllustration type={stage.icon} /><span>CONTENT COMING SOON</span></>}
            </div>
          </section>)}
        </div>
        <div className="aigc-bottomline"><span>IDEAS WITHOUT LIMITS.</span><span>A NEW PERSPECTIVE, BY AGENTECH.</span></div>
      </div>
    </div>
  );
}
