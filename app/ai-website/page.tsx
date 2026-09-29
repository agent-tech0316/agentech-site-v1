import type { Metadata } from "next";
import Link from "next/link";
import { WebsiteConceptPreview } from "@/components/website-concept-preview";
import { WebsiteInquiryForm } from "@/components/website-inquiry-form";
import "./website-launch.css";

export const metadata: Metadata = {
  title: "Website Launch Package — $2,000",
  description: "A focused website for your next chapter. 1–5 pages, responsive design, two revision rounds, and a clear path to launch. Built and reviewed by Agentech.",
  alternates: { canonical: "/ai-website" },
  openGraph: { title: "Your next chapter. Built for the web.", description: "Explore Agentech’s $2,000 Website Launch Package and live concept websites.", url: "/ai-website" }
};

const included = ["1–5 main pages, designed for your business", "Desktop and mobile responsive design", "Basic copy refinement using your materials", "Contact form and basic on-page SEO", "Deployment and source-code handoff", "Two consolidated revision rounds", "30 days of fixes for bugs in the agreed scope"];
const steps = [
  ["01", "Make it clear.", "We review your business, audience, pages, and materials. You approve a written scope and the launch schedule."],
  ["02", "Bring it to life.", "After your 50% deposit and complete materials, we design and build a preview. A person reviews the work before you see it."],
  ["03", "Make it yours.", "Share one complete feedback list per round. We work through two focused revision rounds and check the finished pages."],
  ["04", "Ready for the world.", "Approve the final preview and pay the balance. We launch, hand over the source and instructions, and begin 30-day bug support."]
];
const faqs = [
  ["What kinds of websites fit?", "Company websites, professional services, startup and product sites, and focused landing pages. A SaaS marketing site fits; building the SaaS application itself does not."],
  ["Are the showcase websites real client projects?", "Fieldwork and Orbit are original Agentech concept projects for fictional businesses. You can explore the working demos to assess our design and build quality. They are not paid client work, and we do not claim business results for them."],
  ["When does the 5–7 business day timeline start?", "After the scope is approved, the 50% deposit is received, and your required materials are complete. We confirm a start date with you. Delayed materials, feedback, or scope changes can move the launch date."],
  ["What do I need to provide?", "Your business and audience information, preferred pages, logo, available images and copy, reference websites, and one person responsible for final approval. We refine supplied copy; extensive research, branding, or copywriting needs a separate scope."],
  ["What is outside the package?", "Custom backends, account and login systems, large online stores, apps, ERP, CRM, marketplaces, and open-ended development. Additional pages, languages, ongoing content changes, and CMS editing needs must be scoped before we quote them."],
  ["Are hosting and domains included?", "Deployment setup is included. Domain registration, hosting subscriptions, paid assets, and third-party service charges are separate and agreed before work starts. Accounts should be owned by you."],
  ["How do revisions and bug support work?", "You receive two rounds of consolidated feedback within the approved scope. New features or a change in direction are quoted separately. The 30-day support period begins at launch or handoff and covers defects in delivered functionality; ongoing maintenance and new content are separate."],
  ["Do we need lots of meetings?", "We work primarily through email or project messages, with one point of contact. If a conversation will resolve something faster, we can arrange a focused call of up to 20 minutes."]
];

export default function AIWebsitePage() {
  return (
    <div className="website-launch" data-website-launch>
      <div className="wl-subnav wl-wrap"><Link href="/ai-service" className="wl-breadcrumb">AI-DEVELOPMENT <span>/</span> AI-WEBSITE</Link><nav aria-label="Website service"><a href="#showcase">Showcase</a><a href="#package">The package</a><a href="#inquiry">Let’s build <span aria-hidden="true">↗</span></a></nav></div>
      <section className="wl-hero wl-wrap">
        <div className="wl-hero-copy"><p className="wl-eyebrow"><span className="wl-dot" /> WEBSITES, BY AGENTECH</p><h1>Your next chapter.<br /><span>Built for the web.</span></h1><p className="wl-intro">A considered website for the business you’re building. Clear scope, thoughtful design, and one team from first brief to final handoff.</p><div className="wl-actions"><a className="wl-button wl-button-primary" href="#inquiry">Start your project <span aria-hidden="true">↗</span></a><a className="wl-text-link" href="#showcase">Explore the showcase <span aria-hidden="true">↓</span></a></div><p className="wl-hero-note">$2,000 fixed package · 1–5 main pages · Human reviewed</p></div>
        <div className="wl-hero-visual"><div className="wl-browser wl-hero-browser"><div className="wl-browser-bar"><span>● ● ●</span><span>FIELDWORK / CONCEPT WEBSITE</span><span>↗</span></div><WebsiteConceptPreview /></div><div className="wl-floating-note"><span>YOUR BUSINESS, IN FOCUS</span><p>A good first impression.<br />A clear next step.</p><span className="wl-note-arrow" aria-hidden="true">↗</span></div><div className="wl-visual-caption"><span>01 / AN ORIGINAL AGENTECH CONCEPT</span><span>DESIGNED TO BE EXPLORED</span></div></div>
      </section>
      <div className="wl-facts wl-wrap"><div><span>ONE CLEAR PRICE</span><strong>$2,000 <small>USD</small></strong></div><div><span>FOCUSED SCOPE</span><strong>1–5 <small>main pages</small></strong></div><div><span>PLANNED DELIVERY</span><strong>5–7 <small>business days*</small></strong></div><div><span>HUMAN REVIEW</span><strong>Every <small>project</small></strong></div></div>
      <p className="wl-timing wl-wrap">*After complete materials, approved scope, and deposit. Your start date is confirmed with you.</p>
      <section id="showcase" className="wl-section wl-wrap"><div className="wl-section-heading"><div><p className="wl-eyebrow">01 / THE SHOWCASE</p><h2>See the possibilities.</h2></div><p>Original concept websites, built to explore.<br />A look at our craft, clearly labeled as our own work.</p></div><div className="wl-showcase-grid">
        <article className="wl-showcase-card"><Link className="wl-showcase-image" href="/ai-website/showcase/fieldwork" aria-label="Explore Fieldwork consulting concept"><WebsiteConceptPreview /></Link><div className="wl-showcase-meta"><div><span className="wl-tag">CONCEPT PROJECT</span><h3>Fieldwork Advisory</h3><p>Professional services · Calm, clear, considered.</p></div><Link href="/ai-website/showcase/fieldwork" className="wl-circle-link" aria-label="Open Fieldwork concept">↗</Link></div></article>
        <article className="wl-showcase-card"><Link className="wl-showcase-image" href="/ai-website/showcase/orbit" aria-label="Explore Orbit startup concept"><WebsiteConceptPreview kind="startup" /></Link><div className="wl-showcase-meta"><div><span className="wl-tag">CONCEPT PROJECT</span><h3>Orbit</h3><p>Product & startup · A little less chaos.</p></div><Link href="/ai-website/showcase/orbit" className="wl-circle-link" aria-label="Open Orbit concept">↗</Link></div></article>
      </div><div className="wl-own-work"><span className="wl-tag">OUR OWN WEBSITE</span><p>You’re already exploring another example: Agentech. Our company website has a broader scope than this launch package.</p><Link className="wl-text-link" href="/">Explore Agentech ↗</Link></div></section>
      <section id="package" className="wl-section wl-wrap"><div className="wl-package"><div className="wl-package-intro"><p className="wl-eyebrow">02 / SIMPLE BY DESIGN</p><h2>Everything you need<br />to make your entrance.</h2><p>One focused package for company websites, professional services, and product launches.</p><div className="wl-price">$2,000<span>USD · fixed project price</span></div><a href="#inquiry" className="wl-button wl-button-white">Tell us about your website ↗</a><small>50% to begin. 50% before launch or source handoff.</small></div><div className="wl-package-details"><h3>The Website Launch Package</h3><ul>{included.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul><div className="wl-scope-note"><b>A focused website, with clear boundaries.</b><p>Custom apps, logins, complex backends, and large stores need a separate scope. Domains, hosting, and paid services are separate.</p></div></div></div></section>
      <section id="process" className="wl-section wl-wrap"><div className="wl-section-heading"><div><p className="wl-eyebrow">03 / A CLEAR WAY FORWARD</p><h2>From a first hello<br />to a finished website.</h2></div><p>One point of contact. Written updates.<br />Two focused rounds of feedback.</p></div><div className="wl-steps">{steps.map(([number,title,body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
      <section id="agency-partners" className="wl-wrap wl-section"><div className="wl-agency"><div><p className="wl-eyebrow">FOR DESIGN & MARKETING AGENCIES</p><h2>Your client.<br />Your brand.<br /><span>Our build.</span></h2></div><div><p className="wl-intro">A website delivery partner for the projects you bring in.</p><p>You own the client relationship and consolidate feedback. We handle the agreed build, testing, and handoff through one agency contact. Branding and confidentiality are agreed before we start.</p><a href="#inquiry" className="wl-button wl-button-outline">Discuss an agency project ↗</a><small>Select “An agency client” in the inquiry below.</small></div></div></section>
      <section className="wl-section wl-wrap wl-faq"><div><p className="wl-eyebrow">04 / GOOD TO KNOW</p><h2>A few things,<br />made clear.</h2></div><div>{faqs.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      <section id="inquiry" className="wl-section wl-wrap wl-contact"><div><p className="wl-eyebrow">05 / YOUR NEXT CHAPTER</p><h2>Let’s make<br />something<br /><span>that fits.</span></h2><p>Tell us where your business is going. We’ll review whether the package fits and confirm scope before you commit.</p><a className="wl-text-link" href="mailto:info@agent-tech.ai">info@agent-tech.ai ↗</a></div><WebsiteInquiryForm /></section>
      <div className="wl-end wl-wrap"><span>THOUGHTFULLY BUILT. PERSONALLY REVIEWED.</span><a href="#" aria-label="Back to the top of the website service page">BACK TO TOP ↑</a></div>
    </div>
  );
}
