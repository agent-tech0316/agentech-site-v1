import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConceptBoard, ConceptInquiry } from "@/components/website-concept-interactions";
import "../../website-launch.css";
import "../concept.css";

const concepts = ["fieldwork", "orbit"];
export function generateStaticParams() { return concepts.map(concept => ({ concept })); }
export async function generateMetadata({ params }: { params: Promise<{ concept: string }> }): Promise<Metadata> {
  const { concept } = await params;
  return { title: `${concept === "fieldwork" ? "Fieldwork Advisory" : "Orbit"} — Concept Website`, description: "An original Agentech concept website for a fictional business. Explore the design and interactions.", robots: { index: false, follow: true }, alternates: { canonical: `/ai-website/showcase/${concept}` } };
}

export default async function ConceptPage({ params }: { params: Promise<{ concept: string }> }) {
  const { concept } = await params;
  if (!concepts.includes(concept)) notFound();
  const startup = concept === "orbit";
  return <div className={`website-concept ${startup ? "concept-orbit" : "concept-fieldwork"}`}>
    <div className="concept-disclosure"><Link href="/ai-website#showcase">← Agentech showcase</Link><span>CONCEPT PROJECT · FICTIONAL BUSINESS</span><Link href="/ai-website#inquiry">Want a website like this? ↗</Link></div>
    <div className="concept-wrap"><nav className="concept-nav" aria-label="Concept website"><a href="#concept-top" className="concept-brand">{startup ? <>◒ orbit</> : <>FIELDWORK<span>ADVISORY</span></>}</a><div><a href="#concept-services">{startup ? "Product" : "Our services"}</a><a href="#concept-approach">Our approach</a><a href="#concept-contact" className="concept-nav-cta">Let’s talk ↗</a></div></nav></div>
    {startup ? <>
      <section id="concept-top" className="concept-wrap concept-orbit-hero"><p className="concept-kicker">A LITTLE LESS CHAOS. A LITTLE MORE SPACE.</p><h1>Make room for<br /><span>your best work.</span></h1><p>Bring your plans, projects, and people into one calm place.<br />Meet Orbit, a concept for a more thoughtful workspace.</p><a className="concept-button" href="#concept-product">Explore the product ↓</a><small>A fictional product. A working website concept.</small></section>
      <section id="concept-product" className="concept-wrap concept-product"><ConceptBoard /></section>
      <section id="concept-services" className="concept-wrap concept-section"><p className="concept-kicker">LESS FRICTION. MORE FLOW.</p><h2>Your work has a rhythm.<br />Find a space that fits.</h2><div className="concept-feature-grid">{[["01", "See the whole picture", "Bring scattered tasks into a shared project view. Make the next step easy to find."], ["02", "Keep the context", "Give ideas, decisions, and feedback a place alongside the work they belong to."], ["03", "Move together", "Make ownership clear, share what is ready, and leave room for focused work."]].map(([n,t,b]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{b}</p></article>)}</div></section>
      <section id="concept-approach" className="concept-wrap concept-section"><div className="concept-statement"><p className="concept-kicker">THE IDEA BEHIND ORBIT</p><h2>Good tools should<br />give you space.</h2><p>This product concept explores a simple idea: a workspace can be useful without feeling busy. Clear priorities. Thoughtful details. A little breathing room.</p><a href="#concept-contact">Start a conversation ↗</a></div></section>
    </> : <>
      <section id="concept-top" className="concept-wrap concept-fieldwork-hero"><div><p className="concept-kicker">CLARITY. THEN MOMENTUM.</p><h1>A clearer path<br />to what’s <em>next.</em></h1><p>Thoughtful strategy for businesses ready to move forward. A fresh perspective, a practical plan, and room to grow.</p><a className="concept-button" href="#concept-contact">Find your direction ↗</a></div><div className="concept-architecture"><div className="wl-architecture"><span /><span /><span /><span /></div><p>A DIFFERENT PERSPECTIVE CHANGES WHAT YOU SEE.</p></div></section>
      <section id="concept-services" className="concept-wrap concept-section"><div className="concept-section-title"><p className="concept-kicker">WHERE WE CAN HELP</p><h2>Big questions.<br />Practical next steps.</h2></div><div className="concept-feature-grid">{[["01", "Business strategy", "Get clear on where you are, where you want to go, and what deserves your attention first."], ["02", "Better operations", "Explore the way work gets done. Build processes that support your people and your priorities."], ["03", "Thoughtful growth", "Find the opportunities that fit your business and turn them into an achievable next step."]].map(([n,t,b]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{b}</p><a href="#concept-contact">Let’s talk ↗</a></article>)}</div></section>
      <section id="concept-approach" className="concept-wrap concept-section"><div className="concept-statement"><p className="concept-kicker">OUR APPROACH</p><h2>Start by listening.<br />Move with intention.</h2><p>Every business has its own context. This advisory concept puts understanding first: explore the question, make the choices clear, and turn the direction into a practical plan.</p><div className="concept-method"><span>01 / Understand</span><span>02 / Make a plan</span><span>03 / Move forward</span></div></div></section>
    </>}
    <section id="concept-contact" className="concept-wrap concept-section concept-contact"><div><p className="concept-kicker">THE NEXT STEP STARTS HERE</p><h2>{startup ? <>A little more clarity.<br />Let’s talk.</> : <>What’s on<br />your horizon?</>}</h2><p>Explore this sample inquiry experience. For a real website project, contact Agentech.</p><Link href="/ai-website#inquiry">Discuss your website with Agentech ↗</Link></div><ConceptInquiry startup={startup} /></section>
    <footer className="concept-wrap concept-footer"><b>{startup ? "◒ orbit" : "FIELDWORK ADVISORY"}</b><p>Original concept by Agentech. Fictional business, sample content, no client-results claims.</p><Link href="/ai-website#showcase">Back to the showcase ↑</Link></footer>
  </div>;
}
