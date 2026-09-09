import type { Metadata, ResolvingMetadata } from "next";
import { AboutJourney } from "./about-journey";
import teamStyles from "./about-team.module.css";

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const inherited = await parent;

  return {
    alternates: {
      canonical: "/about"
    },
    openGraph: {
      ...inherited.openGraph,
      url: "/about"
    }
  };
}

const teamMembers = [
  {
    name: "Bill Wang",
    role: "Founder and CEO",
    group: "Leadership",
    category: "leadership"
  },
  {
    name: "Meryl Li",
    role: "Co-founder and COO",
    group: "Operations",
    category: "operations"
  },
  {
    name: "Connie Sun",
    role: "Co-founder and Strategy Advisor",
    group: "Strategy",
    category: "strategy"
  },
  {
    name: "Xin Gao",
    role: "CTO and Senior Hardware Engineer",
    group: "Hardware",
    category: "hardware"
  },
  {
    name: "Wesley Fan",
    role: "Senior Software Engineer",
    group: "Software",
    category: "software"
  },
  {
    name: "Victoria Chen",
    role: "Senior Project Engineer",
    group: "Robotics",
    category: "robotics"
  },
  {
    name: "William Wang",
    role: "Software Engineer",
    group: "Software",
    category: "software"
  },
  {
    name: "George Huang",
    role: "Software Engineer",
    group: "Software",
    category: "software"
  },
  {
    name: "Shuangyi Lian",
    role: "Product Manager",
    group: "Product",
    category: "product"
  }
] as const;

export default function AboutPage() {
  return (
    <section className="about-theme-page relative isolate min-h-[calc(100vh-72px)] overflow-hidden bg-[#040607] px-6 py-20 text-white lg:px-8 lg:py-24">
      <div data-about-ambient aria-hidden="true" className="pointer-events-none absolute left-[-12%] top-10 h-72 w-72 rounded-full bg-[#91dfff]/[0.12] blur-3xl" />
      <div data-about-ambient aria-hidden="true" className="pointer-events-none absolute right-[-8%] top-40 h-80 w-80 rounded-full bg-[#f4c56a]/[0.1] blur-3xl" />
      <div data-about-ambient aria-hidden="true" className="pointer-events-none absolute bottom-[-12%] left-[34%] h-72 w-72 rounded-full bg-[#c9b8f2]/[0.1] blur-3xl" />

      <div className="relative mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p data-about-kicker className="text-xs font-semibold uppercase tracking-[0.34em] text-[#91dfff]">Our Team</p>
          <h1
            data-about-heading
            className="font-display mt-5 text-4xl font-bold tracking-[0.045em] text-white md:text-5xl"
          >
            Leadership and Technical Members
          </h1>
        </div>

        <AboutJourney />

        <div data-team-grid className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {teamMembers.map((member) => (
            <article
              key={member.name}
              data-team-card
              data-team-category={member.category}
              className={`${teamStyles.card} group relative min-h-[218px] overflow-hidden rounded-lg border p-7 transition duration-300 hover:-translate-y-1`}
            >
              <div className={`${teamStyles.topLine} absolute inset-x-0 top-0 h-px opacity-70`} />
              <div data-team-orbit aria-hidden="true" className="absolute right-5 top-5 h-16 w-16 rounded-full border opacity-70 transition duration-300 group-hover:scale-110" />
              <div data-team-spark aria-hidden="true" className="absolute right-10 top-10 h-2 w-2 rounded-full" />

              <div className="relative flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <p data-team-group className="text-[11px] font-semibold uppercase tracking-[0.26em]">
                      {member.group}
                    </p>
                  </div>
                  <h2
                    data-about-heading
                    data-team-name
                    className="font-display mt-8 text-3xl font-bold uppercase tracking-[0.08em] text-white"
                  >
                    {member.name}
                  </h2>
                </div>
                <p
                  data-team-role
                  className="mt-7 max-w-[23rem] text-[13px] font-medium leading-6 tracking-[0.035em]"
                >
                  <span data-team-role-marker className={teamStyles.roleMarker}>&gt;</span> {member.role}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
