import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ClubFaq,
  ClubHeroFacts,
  ClubMobileApply,
  ClubQuickApplication,
  ClubSectionNavigation,
} from "@/components/ai-robotics-club-experience";
import { HistoryBackButton } from "@/components/history-back-button";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/ai-robotics-club", parent);
}

const clubImages = [
  "/assets/talents/club/club-1.png",
  "/assets/talents/club/club-2.png",
  "/assets/talents/club/club-3.png",
  "/assets/talents/club/club-4.png",
  "/assets/talents/club/club-5.png"
];

const coreAbilities = [
  {
    title: "Systems Thinking",
    body: "Students learn to see the complete system behind a robot: input, processing, output, and where failure occurs. This trains them to break complex problems into manageable modules."
  },
  {
    title: "Data Literacy",
    body: "Through sensor sampling, testing logs, and error analysis, students learn that robots do not act based on feelings. They act based on data."
  },
  {
    title: "Algorithmic & Logical Thinking",
    body: "Students learn how rules drive intelligent behavior, from obstacle avoidance to backup workflows, path planning, and automation thinking."
  },
  {
    title: "Engineering Debugging",
    body: "Robotics projects inevitably fail. Students learn how to locate problems, record observations, test hypotheses, and improve solutions."
  },
  {
    title: "Teamwork & Collaboration",
    body: "Students take on roles across mechanical structure, programming, sensor testing, algorithm optimization, competition strategy, and project presentation."
  },
  {
    title: "Communication & Presentation",
    body: "Students learn to explain what problem they solved, how their robot works, what tests they performed, what failed, and how the system improved."
  }
];

const featuredLearningTopics = [
  {
    title: "Agentic Workflow Design",
    titleZh: "AI Automation",
    category: "AI & Agents",
    image: "/assets/talents/club/topics/agentic-workflow.png",
    alt: "AI agent workflow interface with robot assistant and digital dashboards",
    intro: "Learn how modern AI systems plan, reason, and complete complex tasks autonomously.",
    body:
      "Students will explore how advanced AI agents break down goals into smaller steps, use tools, access information, and make decisions to accomplish real-world objectives.",
    topics: [
      "Task decomposition",
      "Planning and reasoning",
      "Tool usage and API integration",
      "Memory systems",
      "Multi-step automation",
      "Agent orchestration",
      "Human-AI collaboration",
      "Multi-agent workflows"
    ],
    projects: [
      "AI research assistants",
      "Automated business workflows",
      "Personal productivity agents",
      "AI customer service systems",
      "Multi-agent collaboration projects",
      "Autonomous robot decision-making systems"
    ],
    outcome:
      "Students will learn the same concepts used in cutting-edge AI companies to build intelligent systems capable of performing tasks with minimal human supervision. By the end of the program, students will be able to design and build AI agents that can think, plan, execute, and collaborate to solve complex problems."
  },
  {
    title: "Artificial Intelligence & Large Language Models",
    titleZh: "AI & LLM",
    category: "AI Foundations",
    image: "/assets/talents/club/topics/ai-llm.png",
    alt: "Artificial intelligence and large language model learning diagram",
    intro: "Explore the technology behind ChatGPT, Claude, Gemini, and the next generation of AI systems.",
    body:
      "Students gain a deep understanding of how modern AI models process information, generate responses, solve problems, and assist humans across countless industries.",
    topics: [
      "Large Language Models (LLMs)",
      "Prompt Engineering",
      "AI reasoning and decision making",
      "Model capabilities and limitations",
      "Retrieval-Augmented Generation (RAG)",
      "AI safety and ethics",
      "AI applications across industries",
      "Future trends in AI"
    ],
    projects: [
      "Custom AI assistants",
      "AI tutoring systems",
      "Knowledge-based chatbots",
      "Research assistants",
      "Industry-specific AI solutions",
      "AI productivity tools"
    ],
    outcome: "Students learn how to work alongside AI as creators rather than simply users."
  },
  {
    title: "Computer Vision",
    titleZh: "Visual AI",
    category: "Computer Vision",
    image: "/assets/talents/club/topics/computer-vision.png",
    alt: "Computer vision learning diagram with detection and recognition examples",
    intro: "Teach computers and robots how to see, understand, and interact with the world.",
    body:
      "Computer Vision powers self-driving cars, security systems, medical imaging, manufacturing robots, and next-generation intelligent machines.",
    topics: [
      "Image recognition",
      "Object detection",
      "Facial recognition",
      "Human pose estimation",
      "Depth perception",
      "Scene understanding",
      "Tracking and localization",
      "Real-time visual AI"
    ],
    projects: [
      "Smart camera systems",
      "Human-following robots",
      "Height estimation systems",
      "Object tracking applications",
      "AI-powered security systems",
      "Interactive vision-based robotics"
    ],
    outcome: "Students develop systems that allow robots to perceive and understand their surroundings."
  },
  {
    title: "Robotics & Embodied AI",
    titleZh: "Embodied Intelligence",
    category: "Robotics",
    image: "/assets/talents/club/topics/robotics-embodied-ai.png",
    alt: "Robotics and embodied AI diagram with sensors, perception, actuators, and mobility",
    intro: "Learn how intelligence moves from software into the physical world.",
    body:
      "Students work directly with advanced robotic systems while learning how hardware, software, AI, and sensors work together.",
    topics: [
      "Robot architecture",
      "Sensors and actuators",
      "Motion control",
      "Robot perception",
      "Autonomous behaviors",
      "Human-robot collaboration",
      "Robot safety systems",
      "Embodied intelligence"
    ],
    projects: [
      "Robot dog applications",
      "Humanoid robot demonstrations",
      "Interactive robotic assistants",
      "Autonomous task execution systems",
      "Service robotics projects",
      "Smart robot behaviors"
    ],
    outcome: "Students gain hands-on experience with technologies used in research labs and industry."
  },
  {
    title: "Autonomous Navigation",
    titleZh: "Autonomous Movement",
    category: "Robotics",
    image: "/assets/talents/club/topics/autonomous-navigation.png",
    alt: "Autonomous navigation diagram with robot mapping, localization, and path planning",
    intro: "Discover how robots understand their environment and move independently.",
    body:
      "Autonomous navigation is one of the core technologies behind self-driving vehicles, warehouse robots, delivery robots, and exploration systems.",
    topics: [
      "Mapping and localization",
      "Path planning",
      "Obstacle avoidance",
      "Environmental awareness",
      "Navigation algorithms",
      "Sensor-based movement",
      "Route optimization",
      "Autonomous exploration"
    ],
    projects: [
      "Self-driving robot challenges",
      "Indoor navigation systems",
      "Mapping competitions",
      "Exploration missions",
      "Autonomous delivery simulations",
      "Intelligent movement planning"
    ],
    outcome: "Students learn how machines make decisions while moving through the real world."
  },
  {
    title: "Multi-Agent Systems & Collaborative Robotics",
    titleZh: "Collaborative Intelligence",
    category: "Multi-Agent Systems",
    image: "/assets/talents/club/topics/multi-agent-systems.png",
    alt: "Multi-agent systems diagram showing collaborative AI agents coordinating across applications",
    intro:
      "Learn how multiple robots and AI systems work together to solve problems larger than any individual system can handle.",
    body: "Students explore the future of distributed intelligence and collaborative automation.",
    topics: [
      "Agent communication",
      "Team coordination",
      "Distributed intelligence",
      "Shared decision making",
      "Resource allocation",
      "Collaborative planning",
      "Swarm intelligence concepts",
      "Cooperative robotics"
    ],
    projects: [
      "Multi-robot competitions",
      "Search and rescue simulations",
      "Collaborative warehouse systems",
      "Autonomous delivery networks",
      "AI team coordination systems",
      "Distributed robotics experiments"
    ],
    outcome: "Students learn how future intelligent systems will coordinate and collaborate at scale."
  },
  {
    title: "Product Development & Entrepreneurship",
    titleZh: "Startup Building",
    category: "Entrepreneurship",
    image: "/assets/talents/club/topics/product-development-entrepreneurship.png",
    alt: "Product development and entrepreneurship workflow from idea to launch",
    intro: "Learn how ideas become successful products, startups, and technology companies.",
    body:
      "Students develop an entrepreneurial mindset while learning how innovation creates real-world impact.",
    topics: [
      "Product design",
      "Customer discovery",
      "Market validation",
      "Business models",
      "Startup strategy",
      "Product management",
      "Technology commercialization",
      "Innovation frameworks"
    ],
    projects: [
      "AI startup concepts",
      "Product prototypes",
      "Investor pitch presentations",
      "Market research studies",
      "Technology business plans",
      "Innovation competitions"
    ],
    outcome: "Students learn to think like founders, innovators, and future industry leaders."
  },
  {
    title: "Hardware Engineering, CAD & 3D Printing",
    titleZh: "Maker Engineering",
    category: "Hardware & Maker",
    image: "/assets/talents/club/topics/hardware-cad-3d-printing.png",
    alt: "Hardware engineering, CAD design, 3D printing, electronics, and mechanical parts diagram",
    intro: "Transform digital ideas into physical inventions.",
    body: "Students design, prototype, and manufacture custom hardware and robotic components.",
    topics: [
      "Electronics fundamentals",
      "Sensors and circuits",
      "Embedded systems",
      "CAD design",
      "Mechanical engineering basics",
      "Rapid prototyping",
      "3D printing technologies",
      "Hardware integration"
    ],
    projects: [
      "Custom robot accessories",
      "Sensor modules",
      "Robot attachments",
      "Mechanical prototypes",
      "Functional hardware systems",
      "Product development prototypes"
    ],
    outcome: "Students learn how engineering ideas become real-world products."
  },
  {
    title: "Research, Innovation & Scientific Discovery",
    titleZh: "Scientific Discovery",
    category: "Research",
    image: "/assets/talents/club/topics/research-innovation.png",
    alt: "Research, innovation, and scientific discovery diagram with lab robotics and data analysis",
    intro: "Develop the mindset and methodology used by scientists, researchers, and inventors.",
    body: "Students learn how groundbreaking technologies are created, tested, and improved.",
    topics: [
      "Research methodology",
      "Experimental design",
      "Hypothesis testing",
      "Data analysis",
      "Technical documentation",
      "Literature review",
      "Innovation processes",
      "Scientific communication"
    ],
    projects: [
      "Independent research studies",
      "Technology investigations",
      "Scientific experiments",
      "Research papers",
      "Competition submissions",
      "Innovation showcase projects"
    ],
    outcome: "Students build critical thinking skills and learn how to generate new knowledge."
  },
  {
    title: "Humanoid Robotics & Motion Control",
    titleZh: "Motion Control",
    category: "Humanoid Robotics",
    image: "/assets/talents/club/topics/humanoid-robotics-motion-control.png",
    alt: "Humanoid robotics and motion control diagram with walking, balance, gestures, and pose control",
    intro: "Learn how humanoid robots stand, walk, balance, gesture, and interact with the physical world.",
    body:
      "Students explore the technologies that allow humanoid robots to perform human-like movements while maintaining stability, coordination, and control.",
    topics: [
      "Robot kinematics",
      "Joint control systems",
      "Balance and stabilization",
      "Walking and locomotion",
      "Motion planning",
      "Whole-body coordination",
      "Pose generation and control",
      "Human motion imitation"
    ],
    projects: [
      "Humanoid walking demonstrations",
      "Gesture and interaction systems",
      "Balance recovery challenges",
      "Motion sequence programming",
      "Human pose imitation systems",
      "Autonomous movement routines"
    ],
    outcome:
      "Students gain hands-on experience with the software and control systems that power the next generation of humanoid robots. By understanding how robots move, balance, and coordinate complex actions, students develop skills directly relevant to modern robotics research and industry applications."
  },
  {
    title: "Leadership, Competitions & Portfolio Development",
    titleZh: "Portfolio Development",
    category: "Leadership",
    image: "/assets/talents/club/topics/leadership-portfolio.png",
    alt: "Leadership competitions and portfolio development diagram with trophy and portfolio dashboard",
    intro: "Success in technology requires more than technical ability.",
    body: "Students learn how to communicate ideas, lead teams, and showcase their accomplishments.",
    topics: [
      "Leadership development",
      "Public speaking",
      "Technical presentations",
      "Team management",
      "Competition strategy",
      "Project documentation",
      "Personal branding",
      "Portfolio creation"
    ],
    projects: [
      "Competition participation",
      "Team leadership roles",
      "Public demonstrations",
      "Project showcases",
      "Technical presentations",
      "Portfolio website development"
    ],
    outcome:
      "Every student graduates with a portfolio demonstrating their technical skills, leadership experience, innovation projects, and real-world accomplishments."
  }
];

function TopicList({
  title,
  items,
  variant,
  mobileLead,
  mobileFooter,
}: {
  title: string;
  items: readonly string[];
  variant: "topics" | "projects";
  mobileLead?: string;
  mobileFooter?: string;
}) {
  const renderItems = () => (
    <div className="topic-list-grid mt-3 grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item}
          data-topic-list-item={variant}
          className="topic-list-item rounded-2xl border px-4 py-3 text-sm font-semibold leading-6"
        >
          {item}
        </div>
      ))}
    </div>
  );

  return (
    <div data-topic-list={variant} className="topic-list-group">
      <div data-club-desktop-topic-details>
        <div className="topic-list-heading flex items-center justify-between gap-3">
          <p className="topic-list-label text-xs font-bold uppercase tracking-[0.2em]">{title}</p>
          <span className="topic-list-kicker" aria-hidden="true">
            {variant === "topics" ? "Learn" : "Build"}
          </span>
        </div>
        {renderItems()}
      </div>
      <details data-club-mobile-topic-details>
        <summary className="topic-list-heading flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden">
          <span className="topic-list-label text-xs font-bold uppercase tracking-[0.2em]">{title}</span>
          <span className="topic-list-kicker" aria-hidden="true">
            {variant === "topics" ? "Learn +" : "Build +"}
          </span>
        </summary>
        {mobileLead ? <p className="mt-3 text-sm leading-6">{mobileLead}</p> : null}
        {renderItems()}
        {mobileFooter ? <p className="topic-outcome-accent mt-4 text-sm leading-6">{mobileFooter}</p> : null}
      </details>
    </div>
  );
}

const projectOutputs = [
  "Engineering notebooks",
  "Technical posters",
  "Demo videos",
  "Testing logs",
  "Competition strategy plans",
  "Project presentation materials"
];

export default function AiRoboticsClubPage() {
  return (
    <section
      data-club-page-theme="warm-off-white"
      className="min-h-screen bg-[#f5f4f1] px-6 py-16 text-[#0b1220] lg:px-8 lg:py-20"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HistoryBackButton
            fallbackHref="/talents"
            className="talent-back-button inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
          />
          <div data-club-surface data-club-language-switch className="inline-flex rounded-full border border-[#d9e1ea] bg-white p-1 text-sm font-bold shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
            <Link data-club-language-active href="/ai-robotics-club" className="rounded-full bg-[#0b1220] px-4 py-2 text-white">
              English
            </Link>
            <Link href="/ai-robotics-club/zh" className="rounded-full px-4 py-2 !text-[#0b1220] transition hover:bg-[#f1f5f9]">
              中文
            </Link>
          </div>
        </div>

        <ClubSectionNavigation locale="en" />
        <ClubMobileApply locale="en" />

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1fr_390px]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#334155]">AI Robotics Club</p>
            <h1 data-club-hero-title className="font-display mt-5 max-w-5xl text-4xl font-semibold uppercase tracking-[0.05em] !text-black md:text-6xl">
              Robotics Competition & Engineering Membership Program
            </h1>
            <p className="mt-6 max-w-3xl text-xl font-semibold leading-8 !text-[#111827]">
              Join a real AI robotics engineering team.
            </p>
            <p className="mt-4 max-w-4xl text-base leading-8 !text-[#334155] md:text-lg">
              From robot construction to algorithms, testing, and competition, students learn how real robots work. This is not just a robotics class. It is a long-term engineering training program.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link data-club-primary-action href="#quick-apply" className="inline-flex rounded-full bg-[#111111] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#33312d]">
                Apply Now
              </Link>
              <Link data-club-secondary-action href="#program-details" className="inline-flex rounded-full border border-[#111111] bg-[#fbfaf7] px-6 py-3 text-sm font-bold !text-[#111111] transition hover:bg-[#111111] hover:!text-white">
                View Program Details
              </Link>
            </div>
            <ClubHeroFacts locale="en" />
          </div>

          <ClubQuickApplication locale="en" />
        </div>

        <div data-club-hero-media className="mt-14 bg-[#f5f4f1]">
          <Image
            data-club-image-blend="hero"
            data-club-image-blend-shape="rectangular"
            src={clubImages[0]}
            alt="AI Robotics Club project preview"
            width={1800}
            height={1100}
            priority
            className="club-hero-image block h-auto w-full object-cover"
          />
        </div>

        <section id="program-details" className="mt-16 scroll-mt-32 grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">Main Introduction</p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black md:text-5xl">
              Students learn to understand why robots work, why they fail, and how to improve them.
            </h2>
          </div>
          <div className="space-y-6 text-base leading-8 !text-[#334155]">
            <p>
              Many robotics classes simply teach students to follow instructions and assemble. At AI Robotics Club, we want students to truly understand how robots perceive the environment, what sensor data actually represents, how algorithms make decisions, why robots fail, and how testing and debugging lead to improvement.
            </p>
            <p>
              Each week, students work through real engineering challenges. Starting from foundational robot construction, they gradually progress into sensor sampling, autonomous obstacle avoidance, path planning, algorithm testing, competition strategy, and project presentation.
            </p>
            <p className="font-semibold !text-[#0b1220]">
              By the end of the program, students will not only complete a robotics project. They will develop a transferable engineering mindset and long-term problem-solving abilities.
            </p>
          </div>
        </section>

        <section id="skills" className="mt-16 scroll-mt-32 rounded-[30px] bg-[#0b1220] p-8 text-white md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#cbd5e1]">Student Growth & Skill Development</p>
              <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-white md:text-5xl">
                Six core abilities students will develop.
              </h2>
              <p className="mt-5 text-base leading-8 !text-[#dbe4ef]">
                Using robotics to develop systems thinking, data literacy, and engineering creativity.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {coreAbilities.map((ability) => (
                <article key={ability.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <h3 className="font-semibold !text-white">{ability.title}</h3>
                  <p className="mt-2 text-sm leading-6 !text-[#dbe4ef]">{ability.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="curriculum" className="mt-24 scroll-mt-32 md:mt-32">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">Featured Learning Topic</p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black md:text-5xl">
              AI skills students can explain, build, and show.
            </h2>
          </div>

          <div className="mt-14 space-y-20 md:mt-20 md:space-y-28">
            {featuredLearningTopics.map((topic, index) => (
              <article
                key={topic.title}
                data-club-surface
                data-club-topic-layout="desktop-fit"
                className="topic-feature-row grid overflow-hidden rounded-[30px] border border-[#d9e1ea] bg-white shadow-[0_26px_70px_rgba(15,23,42,0.09)] lg:grid-cols-[1.05fr_0.95fr]"
              >
                <div
                  data-club-topic-image-stage="seamless"
                  className={`topic-image-panel relative isolate flex min-h-[360px] items-center justify-center overflow-hidden bg-[#020617] sm:min-h-[460px] lg:min-h-full ${index % 2 === 1 ? "lg:order-2" : ""}`}
                >
                  <Image
                    data-club-image-layer="backdrop"
                    src={topic.image}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 1024px) 48vw, 100vw"
                    className="topic-image-backdrop pointer-events-none object-cover"
                  />
                  <Image
                    data-club-image-layer="foreground"
                    data-club-image-blend="topic"
                    data-club-image-blend-shape="rectangular"
                    src={topic.image}
                    alt={topic.alt}
                    width={1200}
                    height={1200}
                    sizes="(min-width: 1024px) 48vw, 100vw"
                    className="topic-image relative z-10 h-auto max-h-[760px] w-full object-contain"
                  />
                </div>
                <div className={`topic-feature-content flex flex-col justify-center p-7 md:p-10 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] !text-[#475569]">{topic.category}</p>
                  <h3 className="font-display topic-feature-title mt-3 text-3xl font-semibold tracking-tight !text-black md:text-4xl">
                    {topic.title}
                  </h3>
                  <p className="topic-feature-subtitle mt-2 text-lg font-semibold !text-[#334155]">{topic.titleZh}</p>
                  <p className="topic-feature-intro mt-5 text-xl font-semibold leading-8 !text-[#0b1220]">{topic.intro}</p>
                  <p data-club-desktop-topic-details className="topic-feature-copy mt-4 text-base leading-8 !text-[#334155]">{topic.body}</p>
                  <div className="topic-list-stack mt-6 space-y-6">
                    <TopicList title="Topics" items={topic.topics} variant="topics" mobileLead={topic.body} />
                    <TopicList title="Projects" items={topic.projects} variant="projects" mobileFooter={topic.outcome} />
                  </div>
                  <p
                    data-club-desktop-topic-details
                    data-topic-outcome-accent="blue-gold"
                    className="topic-feature-outcome topic-outcome-accent mt-6 text-base leading-8 !text-[#334155]"
                  >
                    {topic.outcome}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <ClubFaq locale="en" />

        <section className="mt-14 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div data-club-surface className="rounded-[28px] border border-[#d9e1ea] bg-white p-8 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">Engineering Documentation</p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black">Projects become portfolio-ready work.</h2>
            <p className="mt-5 text-base leading-8 !text-[#334155]">
              Students continuously document designs, testing results, failures, improvements, and data analysis. Final outcomes may include materials that can be showcased for competitions, interviews, science showcases, and future academic opportunities.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projectOutputs.map((item) => (
              <div data-club-surface key={item} className="rounded-2xl border border-[#d9e1ea] bg-[#f8fafc] px-5 py-4 text-sm font-bold !text-[#0b1220]">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section data-club-surface className="mt-14 rounded-[30px] border border-[#d9e1ea] bg-white p-8 shadow-[0_20px_55px_rgba(15,23,42,0.08)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">Call to Action</p>
              <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black md:text-4xl">
                Help your child build the future with AI.
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-8 !text-[#334155]">
                Students progress through real engineering challenges every week, complete milestone-based achievements, and gradually build robotics projects that can be showcased, upgraded, and prepared for competition.
              </p>
            </div>
            <div className="flex items-center lg:justify-end">
              <Link
                data-club-secondary-action
                href="/ai-robotics-club/apply"
                className="inline-flex w-full justify-center rounded-full border border-[#0b1220] bg-white px-8 py-4 text-base font-bold !text-black transition hover:bg-black hover:!text-white lg:w-auto"
              >
                Apply Now
              </Link>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
