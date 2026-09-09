import Image from "next/image";
import Link from "next/link";
import { HistoryBackButton } from "@/components/history-back-button";
import { categoryLabels, prototypeWorks, type PrototypeWork } from "@/lib/eais-showcase";
import base from "@/app/agentech-products/eais/eais-showcase.module.css";
import styles from "@/app/agentech-products/eais/eais-project-detail.module.css";

const projectSections = [
  ["The story", "#story"],
  ["The build", "#build"],
  ["Process", "#process"],
  ["Experiments", "#evidence"],
  ["Resources", "#resources"]
] as const;

export function EaisProjectDetail({ work }: { work: PrototypeWork }) {
  const { project } = work;
  const relatedWorks = prototypeWorks.filter((candidate) => candidate.slug !== work.slug)
    .sort((a, b) => Number(b.category === work.category) - Number(a.category === work.category))
    .slice(0, 2);

  return (
    <div data-eais-project-page className={`${base.page} ${styles.detailPage}`}>
      <aside className={base.sidebar}>
        <Link href="/agentech-products/eais" className={base.wordmark} aria-label="EAIS home">
          <span>AGENTECH</span><strong>EAIS</strong>
        </Link>
        <p className={base.sideLabel}>Inside the project</p>
        <nav className={base.navigation} aria-label="Project sections">
          {projectSections.map(([label, href]) => <a key={href} href={href}>{label}<span aria-hidden="true">↘</span></a>)}
        </nav>
        <p className={base.sideNote}>An idea, the choices behind it, and the next experiment worth trying.</p>
      </aside>

      <main className={base.content}>
        <div className={styles.topBar}>
          <HistoryBackButton fallbackHref="/agentech-products/eais" className={styles.backButton} />
          <Link className={styles.allProjects} href="/agentech-products/eais#all-works">All projects <span aria-hidden="true">↗</span></Link>
        </div>

        <header className={styles.intro}>
          <p className={base.eyebrow}>{categoryLabels[work.category]} <span aria-hidden="true"> / </span> CONCEPT PROJECT</p>
          <div className={styles.titleRow}><h1>{work.title}</h1><p>{work.summary}</p></div>
          <figure className={styles.cover}>
            <div data-eais-cover-framing={work.slug === "prototype-gesture-lab" ? "full-body" : undefined} className={styles.coverImage}><Image src={work.image} alt={work.imageAlt} fill priority sizes="(max-width: 1023px) 100vw, 80vw" /></div>
            <figcaption>{project.coverNote}</figcaption>
          </figure>
        </header>

        <nav className={styles.sectionNavigation} aria-label="Jump to project section">
          {projectSections.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </nav>

        <section id="story" className={styles.story} aria-labelledby="project-story-title">
          <div><p className={base.eyebrow}>THE MOMENT THAT MATTERS</p><h2 id="project-story-title">A small idea, worth exploring.</h2><p className={styles.storyLead}>{project.problem}</p></div>
          <div className={styles.idea}><p>{project.idea}</p><div className={styles.intendedOutcome}><span>INTENDED OUTCOME</span><p>{work.outcome}</p></div></div>
        </section>

        <section id="build" data-eais-project-build className={styles.section} aria-labelledby="project-build-title">
          <div className={styles.sectionHeading}><div><p className={base.eyebrow}>BEHIND THE IDEA</p><h2 id="project-build-title">How it could be built.</h2></div><p>Proposed components and software. Hardware compatibility has not been validated.</p></div>
          <div className={styles.robotNote}><span>ROBOT / PLATFORM</span><p>{project.robot}</p></div>
          <div className={styles.disclosures}>
            <details className={styles.disclosure}>
              <summary><span>Hardware &amp; sensors<small>The proposed physical setup</small></span><b aria-hidden="true">+</b></summary>
              <div className={styles.noteGrid}>{project.hardware.map((note) => <article key={note.title}><h3>{note.title}</h3><p>{note.description}</p></article>)}</div>
            </details>
            <details className={styles.disclosure}>
              <summary><span>AI &amp; software architecture<small>From observation to an intended action</small></span><b aria-hidden="true">+</b></summary>
              <ol className={styles.architecture}>{project.architecture.map((note, index) => <li key={note.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{note.title}</h3><p>{note.description}</p></div></li>)}</ol>
            </details>
          </div>
        </section>

        <section id="process" className={styles.section} aria-labelledby="project-process-title">
          <div className={styles.sectionHeading}><div><p className={base.eyebrow}>MAKING THE IDEA TESTABLE</p><h2 id="project-process-title">One decision at a time.</h2></div><p>A proposed development process. These steps describe work to do.</p></div>
          <ol className={styles.processSteps}>{project.development.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
        </section>

        <section id="evidence" data-eais-project-evidence className={styles.section} aria-labelledby="project-evidence-title">
          <div className={styles.sectionHeading}><div><p className={base.eyebrow}>THE NEXT QUESTION</p><h2 id="project-evidence-title">What would we learn?</h2></div><p>No experiments have been run for this concept record. Results and measurements are not available.</p></div>
          <p className={styles.experimentQuestion}>{project.evidence.question}</p>
          <details className={styles.disclosure}>
            <summary><span>Explore the experiment plan<small>Proposed trials and what to record</small></span><b aria-hidden="true">+</b></summary>
            <div className={styles.noteGrid}>{project.evidence.plan.map((trial) => <article key={trial.title}><h3>{trial.title}</h3><p>{trial.description}</p></article>)}</div>
          </details>
          <div data-eais-project-demo className={styles.demoSlot}>
            <div className={styles.demoMark} aria-hidden="true"><span /></div>
            <div><span className={styles.smallLabel}>PROJECT DEMO · NOT PUBLISHED</span><h3>A place for the full attempt.</h3><p>{project.demo.description}</p></div>
          </div>
        </section>

        <section id="resources" data-eais-project-resources className={styles.section} aria-labelledby="project-resources-title">
          <div className={styles.sectionHeading}><div><p className={base.eyebrow}>TAKE A CLOSER LOOK</p><h2 id="project-resources-title">People &amp; resources.</h2></div><p>Project materials will appear here when they are available.</p></div>
          <div className={styles.team}><span className={styles.smallLabel}>CREATOR / TEAM</span><p>{project.team.description}</p></div>
          <div className={styles.resourceList}>{project.resources.map((resource) => <article key={resource.kind}><div><h3>{resource.title}</h3><p>{resource.description}</p></div><span>Not published</span></article>)}</div>
          <div className={styles.developerEntry}><div><h3>Inspired to build something?</h3><p>Explore the EAIC SDK reference to learn about supported interfaces. It is a general developer resource; this concept has no runnable example.</p></div><div><Link href="/agentech-products/eaic-hub/view-sdk">Explore EAIC SDK <span aria-hidden="true">↗</span></Link><small>EAIC profile required</small></div></div>
        </section>

        <section className={styles.related} aria-labelledby="related-projects-title">
          <div className={styles.sectionHeading}><div><p className={base.eyebrow}>KEEP YOUR CURIOSITY GOING</p><h2 id="related-projects-title">Another idea to follow.</h2></div><Link href="/agentech-products/eais#all-works">Explore all projects <span aria-hidden="true">↗</span></Link></div>
          <div className={styles.relatedGrid}>{relatedWorks.map((related) => <Link key={related.slug} href={`/agentech-products/eais/projects/${related.slug}`} className={styles.relatedCard}><div><Image src={related.image} alt={related.imageAlt} fill sizes="(max-width: 767px) 88vw, 40vw" /></div><span><small>{categoryLabels[related.category]} / CONCEPT</small><strong>{related.title}</strong><em>{related.summary}</em><b>Open project <span aria-hidden="true">↗</span></b></span></Link>)}</div>
        </section>
      </main>
    </div>
  );
}
