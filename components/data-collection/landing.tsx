"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { collectionScenarios } from "@/lib/data-collection";
import { DataIcon } from "./icon";

const steps = [
  ["Define your brief", "Tell us the task, environment, modalities, and volume your model needs."],
  ["Align on a pilot", "Agree on the collection plan, sample criteria, and acceptance requirements."],
  ["Review the data", "Evaluate a representative sample before expanding the collection."],
  ["Scale with confidence", "Move to batch delivery with agreed formats and documented quality checks."]
];

export function DataCollectionLanding({ localPreview }: { localPreview: boolean }) {
  const [category, setCategory] = useState("All scenarios");
  const [query, setQuery] = useState("");
  const workspace = `/data-collection/workspace${localPreview ? "?preview=1" : ""}`;
  const scenarios = collectionScenarios.filter((item) => (category === "All scenarios" || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <>
    <div className="dc-subnav"><Link href="/data-collection" className="dc-product-mark"><DataIcon name="layers" size={19} /> DATA COLLECTION <span>FOR PHYSICAL AI</span></Link><nav aria-label="Data collection"><a href="#scenarios">Scenarios</a><a href="#process">How it works</a><Link href={workspace} className="dc-text-link">Buyer workspace <DataIcon name="arrow" size={16} /></Link></nav></div>
    <div className="dc-container">
      <section className="dc-hero">
        <div className="dc-hero-copy">
          <div className="dc-eyebrow"><span className="dc-dot" /> FROM THE REAL WORLD. FOR WHAT’S NEXT.</div>
          <h1>Real-world data.<br /><span>Built for your<br className="dc-desktop-break" /> model.</span></h1>
          <p>Better embodied intelligence starts with the right experience. Source purposeful human and robot demonstrations, built around the tasks that matter to you.</p>
          <div className="dc-actions"><Link href={`${workspace}${localPreview ? "&" : "?"}view=new`} className="dc-button dc-primary">Start a collection project <DataIcon name="arrow" size={18} /></Link><a href="#scenarios" className="dc-button dc-secondary">Explore scenarios</a></div>
          <div className="dc-hero-note"><DataIcon name="profile" size={16} /><span>One Agentech account. A dedicated buyer profile.</span></div>
        </div>
        <figure className="dc-hero-visual">
          <Image src="/assets/data-collection/egocentric-collection.webp" alt="Illustrative first-person view of precision component sorting in a collection environment" fill sizes="(max-width: 800px) 100vw, 52vw" priority />
          <div className="dc-view-label"><span className="dc-dot" /> EGOCENTRIC PERSPECTIVE <span>HUMAN DEMONSTRATION</span></div>
          <span className="dc-tracking-box dc-track-one"><span>HAND–OBJECT INTERACTION</span></span><span className="dc-tracking-box dc-track-two" />
          <figcaption><span className="dc-mono">COLLECTION SCENARIO</span><strong>Small actions.<br />Rich learning signals.</strong><div><span>Human demonstrations</span><span>Fine manipulation</span></div></figcaption>
          <span className="dc-image-credit">Illustrative scene</span>
        </figure>
      </section>
      <div className="dc-capability-strip"><span>DESIGNED AROUND YOUR DATA NEEDS</span><div><DataIcon name="scan" /> Egocentric video</div><div><DataIcon name="layers" /> Multimodal capture</div><div><DataIcon name="robot" /> Robot trajectories</div><div><DataIcon name="shield" /> Defined quality criteria</div></div>
      <section id="scenarios" className="dc-section">
        <div className="dc-section-heading"><div><div className="dc-eyebrow">01 / COLLECTION SCENARIOS</div><h2>The world is your<br />training environment.</h2></div><p>Start with a setting. Shape it around your task.<br />Every project begins with your requirements.</p></div>
        <div className="dc-catalog-controls"><div className="dc-filters" aria-label="Filter scenarios">{["All scenarios", "Industrial", "Everyday", "Robotics", "Custom"].map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><label className="dc-search"><DataIcon name="search" size={17} /><input aria-label="Search collection scenarios" placeholder="Find a scenario" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="dc-scenarios" aria-live="polite">{scenarios.map((item) => <Link key={item.id} href={`${workspace}${localPreview ? "&" : "?"}view=new&scenario=${item.id}`} className={`dc-scenario dc-scenario-${item.color}`}><div className="dc-scenario-art"><span className="dc-scenario-number">{String(collectionScenarios.indexOf(item) + 1).padStart(2, "0")}</span><div className="dc-art-grid" /><DataIcon name={item.icon} size={78} /><span className="dc-scenario-category">{item.category}</span><span className="dc-card-arrow"><DataIcon name="arrow" size={19} /></span></div><div className="dc-scenario-content"><h3>{item.name}</h3><p>{item.description}</p><span>{item.tasks}</span></div></Link>)}</div>
        {!scenarios.length && <div className="dc-empty"><DataIcon name="search" size={32} /><h3>No matching scenarios</h3><p>Try another search, or start with a custom collection.</p><button className="dc-button dc-secondary" onClick={() => { setQuery(""); setCategory("All scenarios"); }}>Clear filters</button></div>}
        <p className="dc-catalog-note">A starting point for your brief. Scope, availability, and pricing are confirmed after project review.</p>
      </section>
      <section id="process" className="dc-section dc-process"><div className="dc-section-heading"><div><div className="dc-eyebrow">02 / YOUR COLLECTION JOURNEY</div><h2>From a clear brief<br />to useful data.</h2></div><p>Stay involved at the moments that matter.<br />Define success before collection begins.</p></div><div className="dc-steps">{steps.map(([title, description], index) => <article key={title}><div className="dc-step-number">0{index + 1}<span /></div><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section className="dc-quality"><div><div className="dc-eyebrow">SPECIFY WHAT GOOD LOOKS LIKE</div><h2>Your model.<br />Your acceptance criteria.</h2><p>Make the details part of the brief from day one, so collection and evaluation stay aligned.</p><Link href={`${workspace}${localPreview ? "&" : "?"}view=new`} className="dc-button dc-primary">Build your data brief <DataIcon name="arrow" size={18} /></Link></div><div className="dc-spec-sheet"><div className="dc-spec-top"><DataIcon name="layers" /><span>DATASET REQUIREMENTS</span><span className="dc-pill">YOUR SPECIFICATION</span></div>{[["Capture", "Viewpoints, resolution, frame rate"], ["Coverage", "Tasks, environments, variation"], ["Annotations", "Labels, timestamps, task outcomes"], ["Delivery", "Format, structure, batch size"], ["Governance", "Usage rights, consent, retention"]].map(([label, value]) => <div className="dc-spec-row" key={label}><span>{label}</span><strong>{value}</strong><DataIcon name="check" size={17} /></div>)}</div></section>
      <section className="dc-final-cta"><div className="dc-eyebrow">LET’S BUILD YOUR NEXT DATASET</div><h2>What does your model<br />need to learn next?</h2><p>Create your buyer profile and turn the idea into a collection brief.</p><Link href={workspace} className="dc-button dc-primary">Open your buyer workspace <DataIcon name="arrow" size={18} /></Link><span>Use your existing Agentech sign-in.</span></section>
    </div>
  </>;
}
