"use client";

import { BuildWorkshop } from "./about-build-workshop";
import { IdeaWorkshop } from "./about-idea-workshop";
import { ShareWorkshop } from "./about-share-workshop";
import styles from "./about-intro.module.css";

const steps = [
  {
    id: "idea",
    label: "Idea",
    eyebrow: "Begin with curiosity",
    title: "Sketch what could be.",
    description:
      "A question, rough sketch, or imagined robot behavior gives the next experiment a clear place to start.",
    Scene: null
  },
  {
    id: "build",
    label: "Build",
    eyebrow: "EAIC workspace",
    title: "Build, validate, refine.",
    description:
      "EAIC helps teams program, validate, and refine a robot prototype before a supervised robot session.",
    Scene: BuildWorkshop
  },
  {
    id: "share",
    label: "Share",
    eyebrow: "EAIS showcase",
    title: "Make the process visible.",
    description:
      "EAIS makes robotics projects easier to explore through their idea, process, and lessons for the maker community.",
    Scene: ShareWorkshop
  }
] as const;

export function AboutJourney() {
  return (
    <section data-about-intro className={styles.intro} aria-labelledby="about-journey-statement">
      <header className={styles.introHeader}>
        <h2 id="about-journey-statement" data-about-intro-statement className={styles.statement}>
          At Agentech, we turn curiosity into creation with AI and robotics.
        </h2>
        <p data-about-intro-copy className={styles.copy}>
          {"Through software tools, robot applications, and hands-on learning, we help you explore ideas, build skills, and create projects of your own."}
        </p>
      </header>

      <div data-about-journey-grid className={styles.cardGrid}>
        {steps.map((step, index) => {
          const Scene = step.Scene;
          const isInteractive = step.id === "idea" || Scene !== null;

          return (
            <article
              key={step.id}
              data-journey-card
              data-journey-step={step.id}
              className={styles.card}
              aria-labelledby={`about-journey-title-${step.id}`}
            >
              <p className={styles.stepLabel}>
                <span data-journey-number className={styles.stepNumber} aria-hidden="true">
                  0{index + 1}
                </span>
                <span data-journey-label>{step.label}</span>
              </p>

              <div
                data-journey-scene
                data-journey-scene-kind={step.id}
                className={styles.scene}
                aria-hidden={isInteractive ? undefined : true}
              >
                {step.id === "idea" ? <IdeaWorkshop active /> : Scene ? <Scene /> : null}
              </div>

              <div className={styles.cardCopy}>
                <p className={styles.eyebrow}>{step.eyebrow}</p>
                <h3 id={`about-journey-title-${step.id}`} className={styles.cardTitle}>
                  {step.title}
                </h3>
                <p className={styles.description}>{step.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
