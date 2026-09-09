"use client";

import { IdeaWorkshop } from "./about-idea-workshop";
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
    Scene: BuildScene
  },
  {
    id: "share",
    label: "Share",
    eyebrow: "EAIS showcase",
    title: "Make the process visible.",
    description:
      "EAIS makes robotics projects easier to explore through their idea, process, and lessons for the maker community.",
    Scene: ShareScene
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
          const isInteractive = step.id === "idea";
          const Scene = step.Scene;

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
                {isInteractive ? <IdeaWorkshop active /> : Scene ? <Scene /> : null}
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

function BuildScene() {
  return (
    <svg className={styles.sceneSvg} viewBox="0 0 520 250" role="presentation">
      <g className={styles.buildWindow}>
        <rect x="48" y="46" width="218" height="154" rx="12" />
        <path d="M48 78h218" />
        <circle cx="68" cy="62" r="4" />
        <circle cx="84" cy="62" r="4" />
        <circle cx="100" cy="62" r="4" />
      </g>
      <g className={styles.codeLines}>
        <path d="m80 112 14-12M80 112l14 12M130 100l14 12-14 12" />
        <path d="M170 104h62M170 120h44M80 154h152M80 174h110" />
      </g>
      <path className={styles.flowLine} d="M278 124h42" />
      <path className={styles.flowArrow} d="m310 114 12 10-12 10" />
      <g className={styles.robotBody}>
        <rect x="350" y="82" width="116" height="96" rx="28" />
        <path d="M376 178v28M440 178v28M350 139h-24M466 139h24M408 82V62" />
        <circle cx="408" cy="56" r="7" />
        <circle cx="387" cy="121" r="7" />
        <circle cx="429" cy="121" r="7" />
        <path d="M387 149h42" />
      </g>
      <g className={styles.validationNodes}>
        <circle cx="333" cy="48" r="13" />
        <path d="m327 48 4 4 8-9" />
        <circle cx="480" cy="62" r="8" />
        <circle cx="496" cy="192" r="5" />
      </g>
    </svg>
  );
}

function ShareScene() {
  return (
    <svg className={styles.sceneSvg} viewBox="0 0 520 250" role="presentation">
      <g className={styles.connectionLines}>
        <path d="M92 76 258 40l170 50M92 76l30 128 136 8 170-122M258 40v172" />
      </g>
      <g className={styles.communityNodes}>
        <circle cx="92" cy="76" r="9" />
        <circle cx="122" cy="204" r="7" />
        <circle cx="428" cy="90" r="9" />
        <circle cx="258" cy="40" r="7" />
        <circle cx="258" cy="212" r="7" />
      </g>
      <g className={styles.profileCard}>
        <rect x="154" y="62" width="216" height="136" rx="16" />
        <rect x="174" y="82" width="72" height="72" rx="10" />
        <path d="M190 137v-28l20-12 20 12v28l-20 11-20-11Z" />
        <path d="M274 90h68M274 110h50M274 142h68M274 160h54" />
        <circle cx="336" cy="174" r="4" />
        <circle cx="322" cy="174" r="4" />
      </g>
      <g className={styles.shareAccent}>
        <path d="m407 39 8-14 8 14 14 8-14 8-8 14-8-14-14-8Z" />
        <path d="M72 160h46M95 137v46" />
      </g>
    </svg>
  );
}
