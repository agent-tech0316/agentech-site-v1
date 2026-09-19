import Image from "next/image";
import Link from "next/link";
import { AgentechGalaxyHero } from "@/components/agentech-galaxy-hero";
import { WindowsDownloadButton } from "@/components/navi-download/windows-download-button";
import styles from "./navi-download.module.css";

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d={down ? "M12 4v15m-6-6 6 6 6-6" : "M5 12h14m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: "mac" | "windows" }) {
  return platform === "mac" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.7 1.8c.1 1.4-.4 2.7-1.3 3.7-.8.9-2.1 1.5-3.3 1.4-.2-1.4.4-2.7 1.2-3.6.9-1 2.3-1.6 3.4-1.5ZM20.3 17.7c-.5 1.2-.8 1.7-1.5 2.8-1 1.4-2.3 3.2-3.9 3.2-1.4 0-1.8-.9-3.7-.9-1.9 0-2.4.9-3.8.9-1.6 0-2.9-1.6-3.9-3.1C.7 16.4.4 10.9 2.2 8.5c1.3-1.7 3.3-2.5 5.2-2.1 1.5.3 2.5 1 3.8 1 1.2 0 2-.7 3.8-1 1.6-.3 3.5.3 4.8 1.7-4.2 2.3-3.5 8.1.5 9.6Z" transform="translate(2 0) scale(.87)" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 3h9v9H2zm11 0h9v9h-9zM2 14h9v9H2zm11 0h9v9h-9z" transform="translate(0 -1)" />
    </svg>
  );
}

const questions = [
  {
    question: "When can I download Navi?",
    answer: "The Windows app is available to download now. The macOS app is still in development and will be added here when it is ready.",
  },
  {
    question: "Which computers will be supported?",
    answer: "The current release is for Windows. Supported macOS versions and Mac chip requirements will be listed here before the Mac download opens.",
  },
  {
    question: "Can I explore Navi before the app launches?",
    answer: <>Yes. You can explore our <Link href="https://www.agent-tech.ai/agentech-products/eaic-hub/view-sdk">SDK reference</Link> now. If you’re joining a class, follow your teacher’s setup instructions.</>,
  },
];

export function NaviDownloadPage() {
  return (
    <div className={styles.page} data-navi-download>
      <a className={styles.skipLink} href="#download">Skip to downloads</a>
      <div className={styles.heroShell}>
        <div className={styles.artwork} aria-hidden="true">
          <AgentechGalaxyHero title="Navi" backgroundOnly />
          <div className={styles.artworkShade} />
        </div>

        <header className={styles.header}>
          <Link className={styles.brand} href="https://www.agent-tech.ai/" aria-label="Agentech home">
            <Image src="https://navi-app-download.wesleyfan2015.chatgpt.site/assets/logo/AGENTECH-white.png" alt="Agentech" width={1000} height={101} priority />
          </Link>
          <span className={styles.navDivider} aria-hidden="true" />
          <a className={styles.productName} href="#overview">Navi</a>
          <nav aria-label="Download page navigation" className={styles.navigation}>
            <a className={styles.desktopLink} href="#questions">FAQ</a>
            <Link className={styles.desktopLink} href="https://www.agent-tech.ai/agentech-products/eaic-hub/view-sdk">SDK reference <span aria-hidden="true">↗</span></Link>
            <a className={styles.navDownload} href="#download">Get Navi <Arrow down /></a>
          </nav>
        </header>

        <section className={styles.hero} id="overview" aria-labelledby="navi-title">
          <div className={styles.eyebrow}><span /> MEET NAVI FOR DESKTOP</div>
          <h1 id="navi-title">Your ideas.<br /><span>Set in motion.</span></h1>
          <p className={styles.intro}>Big curiosity. Real possibilities.<br />Your robotics journey starts with Navi.</p>

          <div className={styles.downloadArea} id="download" aria-label="Download Navi">
            <div className={styles.downloadButtons}>
              <div className={styles.platform}>
                <button type="button" className={`${styles.downloadButton} ${styles.macButton}`} disabled aria-describedby="download-status">
                  <PlatformIcon platform="mac" /><span>Download for Mac</span><Arrow down />
                </button>
                <span className={styles.platformLabel}>macOS <span aria-hidden="true">·</span> Coming soon</span>
              </div>
              <div className={styles.platform}>
                <WindowsDownloadButton
                  buttonClassName={`${styles.downloadButton} ${styles.windowsButton}`}
                  labelClassName={styles.platformLabel}
                />
              </div>
            </div>
            <p className={styles.releaseNote} id="download-status"><span className={styles.statusDot} /> Agentech V1.0 for Windows (v9.14) is ready. macOS is still on the way.</p>
            <div className={styles.sourceDownload}><WindowsDownloadButton source buttonClassName={styles.sourceButton} labelClassName={styles.platformLabel} /></div>
          </div>

          <Link className={styles.exploreLink} href="https://www.agent-tech.ai/agentech-products/eaic-hub/view-sdk">Curious already? Explore the SDK <Arrow /></Link>
          <a className={styles.scrollHint} href="#start"><span>MADE FOR YOUR NEXT FIRST</span><Arrow down /></a>
        </section>
      </div>

      <section className={styles.startSection} id="start" aria-labelledby="start-title">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>FROM CURIOUS TO CREATOR</p>
          <h2 id="start-title">A small download.<br />A whole new starting point.</h2>
          <p>From your first class to your next idea.<br />Get ready to make something move.</p>
        </div>
        <div className={styles.steps}>
          <article><span className={styles.stepNumber}>01 / DOWNLOAD</span><h3>Your computer. Your choice.</h3><p>Download Navi for Windows now. The Mac app will be added when it is ready.</p></article>
          <article><span className={styles.stepNumber}>02 / GET READY</span><h3>A little setup. A big start.</h3><p>Install the app and follow your teacher’s instructions to get ready for class.</p></article>
          <article><span className={styles.stepNumber}>03 / EXPLORE</span><h3>Let curiosity take the lead.</h3><p>Start with your classroom activities, explore the SDK, and see where your ideas go.</p></article>
        </div>
      </section>

      <section className={styles.faqSection} id="questions" aria-labelledby="faq-title">
        <div><p className={styles.sectionLabel}>A FEW GOOD QUESTIONS</p><h2 id="faq-title">Before you get started.</h2></div>
        <div className={styles.faqList}>
          {questions.map(({ question, answer }) => (
            <details className={styles.question} key={question}>
              <summary>{question}<span aria-hidden="true" className={styles.plus} /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="https://www.agent-tech.ai/" aria-label="Agentech home"><Image src="https://navi-app-download.wesleyfan2015.chatgpt.site/assets/logo/AGENTECH-white.png" alt="Agentech" width={1000} height={101} /></Link>
        <p>Built for curious minds.</p>
        <Link href="https://www.agent-tech.ai/about">Meet Agentech <Arrow /></Link>
      </footer>
    </div>
  );
}
