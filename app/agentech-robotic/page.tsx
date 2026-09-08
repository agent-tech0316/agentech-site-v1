import type { Metadata, ResolvingMetadata } from "next";

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const inherited = await parent;

  return {
    alternates: {
      canonical: "/agentech-robotic"
    },
    openGraph: {
      ...inherited.openGraph,
      url: "/agentech-robotic"
    }
  };
}

import Image from "next/image";
import { RoboticsMobileProductBrowser } from "@/components/robotics-mobile-product-browser";

const products = [
  {
    name: "FX Navi",
    price: "$1,990+",
    package: ["Modular", "Skill Package"],
    image: "/assets/robotics/ff-navi-white.jpg",
    imageFit: "object-contain",
    imageClass: "origin-bottom object-bottom scale-[0.82] p-3 md:scale-[0.84] xl:scale-[0.88]",
    accent: "navi",
    summary: "A compact Navi quadruped for younger builders, classroom demos, and first robotics projects."
  },
  {
    name: "Aegis Pro",
    price: "$4,490",
    package: ["No", "Skill Package"],
    image: "/assets/robotics/ff-aegis-pro-sku.jpg",
    imageFit: "object-contain",
    imageClass: "origin-bottom object-bottom scale-[1.15] md:scale-[1.2] xl:scale-[1.35]",
    accent: "aegis",
    summary: "A professional embodied-AI quadruped for patrol, field mobility, demos, and prototyping."
  },
  {
    name: "Aegis Edu",
    price: "$9,990",
    package: ["Includes $1,000", "Skill Package"],
    image: "/assets/robotics/ff-aegis-edu-sku.jpg",
    imageFit: "object-contain",
    imageClass: "origin-bottom object-bottom scale-[1.15] md:scale-[1.2] xl:scale-[1.35]",
    accent: "aegis",
    summary: "The Aegis education package for robotics courses, research training, and developer expansion."
  },
  {
    name: "Master Ultra",
    price: "$64,990",
    package: ["Includes $15,000", "Skill Package"],
    image: "/assets/robotics/ff-master-ultra.jpg",
    imageFit: "object-contain",
    imageClass: "origin-top object-top scale-[1.55] md:scale-[1.65] xl:scale-[1.85]",
    accent: "master",
    summary: "The FF Master humanoid model Agentech currently carries, with expanded sensing and compute."
  }
] as const;

const sections = [
  {
    title: "LINEUP & PACKAGE",
    rows: [
      ["ROBOT TYPE", "Compact Quadruped", "Pro Quadruped", "Edu Quadruped", "Humanoid"],
      ["PRIMARY USE", "Youth / Classroom", "Patrol / Demo", "Education / Research", "Research / Performance"],
      ["REFERENCE PRICE", "$1,990+", "$4,490", "$9,990", "$64,990"],
      ["SKILL SET", "Youth AI / Classroom", "--", "$1,000 Valued Skill Package", "$15,000 Valued Skill Package"],
      ["AGENTECH ORDERING", "Permit Pending", "Permit Pending", "Permit Pending", "Permit Pending"]
    ]
  },
  {
    title: "MECHANICAL & MOTION",
    rows: [
      ["DIMENSIONS", "112 (308 Stand) x 298 x 515 mm", "610 x 370 x 406 mm", "610 x 370 x 406 mm", "1310 H x 460 W x 210 L mm"],
      ["HEIGHT", "515 mm", "406 mm Stand", "406 mm Stand", "1310 mm"],
      ["WEIGHT", "Approx. 8 kg", "15 kg", "15 kg", "39 kg"],
      ["MATERIALS", "Carbon-fiber Composite + Soft Fabric", "Aluminum Alloy + Engineering Plastics", "Aluminum Alloy + Engineering Plastics", "Mg Alloy + Al + Polyurethane"],
      ["DOF", "12 DOF", "12 DOF", "12 DOF", "30 DOF"],
      ["MOTORS", "12 Joint Motors", "12 Joint Actuators", "12 Joint Actuators", "30 Motors"],
      ["MAX SPEED", "2 m/s", "3.7 m/s", "3.7 m/s", "1.8 m/s Walking"],
      ["PEAK TORQUE", "12 N*m Joint Torque", "48 N*m", "48 N*m", "120 N*m"],
      ["STAIR CLIMB", "--", "16 cm", "16 cm", "--"],
      ["PAYLOAD", "Light Payload", "Max 8 kg", "Max 8 kg", "Max 3 kg"],
      ["OBSTACLE CROSSING", "Up to 34 cm", "35 cm", "35 cm", "--"],
      ["MAX CLIMBING SLOPE", "--", "30 deg", "30 deg", "--"],
      ["PROTECTION LEVEL", "--", "IP32", "IP32", "--"]
    ]
  },
  {
    title: "POWER & CONNECTIVITY",
    rows: [
      ["RUNTIME", "Approx. 2 h", "1-2 h", "1-2 h", "Approx. 2 h Walking"],
      ["BATTERY", "0.2-0.3 kWh Built-in Lithium", "216 Wh / 43.2 V", "216 Wh / 43.2 V", "Approx. 500 Wh"],
      ["CHARGING TIME", "Direct US-spec Charging", "1 h", "1 h", "<= 1.5 h"],
      ["AUTO CHARGING", "Optional Dock", "--", "In Development", "Optional Auto Dock"],
      ["NETWORK", "Wi-Fi / Bluetooth / 4G / 5G", "Wi-Fi / Bluetooth", "Wi-Fi / Bluetooth", "Wi-Fi / Bluetooth / 4G / 5G"],
      ["INPUT VOLTAGE", "US Household Power", "110-220 V", "110-220 V", "110-220 V"],
      ["REMOTE CONTROL", "Remote Controller + Mobile App", "Remote Controller + App", "Remote Controller + App", "Remote Controller + App / VR"]
    ]
  },
  {
    title: "PERCEPTION & COMPUTE",
    rows: [
      ["COMPUTING PLATFORM", "Phone App + Localized UI", "--", "--", "NVIDIA Orin NX 16 GB"],
      ["COMPUTING POWER", "Not Disclosed", "--", "--", "157 TOPS"],
      ["CAMERAS", "Phone Camera / Mic / Display", "4K Wide-angle", "4K Wide-angle", "Interactive + Dual RGB + Rear + RGB-D"],
      ["LIDAR", "Hardware Expansion API", "--", "--", "3D LiDAR"],
      ["IMU", "--", "Supported", "Supported", "High-precision 6-axis"],
      ["DISPLAY / EXPRESSIONS", "App Display + 10 Expressions", "--", "--", "Screen + Lights / 30+ Expressions"],
      ["LANGUAGE INTERACTION", "50 Languages via App", "--", "--", "50+ Languages"]
    ]
  },
  {
    title: "PLATFORM & SKILLS",
    rows: [
      ["SECONDARY DEVELOPMENT", "Low-level Interface + Python SDK", "--", "SDK / APIs + Isaac Sim + Python", "SDK / APIs + Ubuntu 22.04"],
      ["VISUAL PROGRAMMING", "Supported", "--", "Basic Platform", "Advanced + Python Code"],
      ["OTA UPDATES", "Supported", "--", "--", "Continuous OTA Unlocks"],
      ["AUTONOMOUS PATROL", "Command-driven", "--", "Auto Nav in Development", "--"],
      ["AUTONOMOUS FOLLOWING", "--", "--", "--", "--"],
      ["PRESET MOTIONS", "5+ Biomimetic Behaviors", "--", "--", "Body Motion + Performance Skills"],
      ["EXPANSION PORTS", "5V / 12V + USB + Back Bolts", "--", "Ethernet / USB / SBUS / UART", "--"],
      ["EXPANDABLE PERIPHERALS", "Sensors + Hardware Expansion", "Costume Included", "Edu Port Expansion", "Expandable Dexterous Hands"]
    ]
  },
] as const;

const accentText = {
  navi: "text-[#8fd8c8]",
  aegis: "text-[#a8bdd6]",
  master: "text-[#c9b8f2]"
} as const;

const runtimeLevels = [
  "L0.0 Primitive Motors",
  "L0.5 Atomic Actions",
  "L1.0 Behaviors",
  "L1.5 Tasks",
  "L2.0 Agentic Workflows",
  "L2.5 Missions"
] as const;

export default function AgentechRoboticPage() {
  return (
    <div className="robotics-theme-page overflow-x-hidden bg-[#030506] text-white">
      <div id="top" />

      <section data-robotics-hero className="relative isolate overflow-hidden border-b border-white/10 bg-[#030506] md:min-h-[430px] lg:min-h-[500px]">
        <div data-robotics-hero-media className="relative md:absolute md:inset-0">
          <Image
            data-robotics-hero-image
            src="/assets/ff-robotics/ff-master-x2-hero.jpg"
            alt="FF Master humanoid robot"
            fill
            sizes="100vw"
            className="object-cover object-[68%_center] opacity-88"
            priority
          />
          <div data-robotics-hero-overlay className="absolute inset-0 bg-[linear-gradient(90deg,#030506_0%,rgba(3,5,6,0.98)_26%,rgba(3,5,6,0.48)_58%,rgba(3,5,6,0.10)_100%)]" />
          <div data-robotics-hero-fade className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#030506] to-transparent" />
        </div>

        <div data-robotics-hero-copy className="relative mx-auto w-full max-w-7xl px-6 py-9 md:flex md:min-h-[430px] md:items-center md:py-14 lg:min-h-[500px] lg:px-8">
          <div data-robotics-hero-brand className="min-w-0 max-w-2xl">
            <Image
              data-robotics-hero-logo
              src="/assets/logo/AGENTECH-robotic-solid.png"
              alt="Agentech Robotics"
              width={1000}
              height={247}
              className="robotics-theme-logo h-auto w-full max-w-[300px] opacity-95 sm:max-w-[340px] lg:max-w-[380px]"
              priority
            />
            <p
              data-robotics-hero-tagline
              className="font-interface mt-5 text-xs font-semibold uppercase leading-6 tracking-[0.3em] text-[#91dfff] md:mt-10 md:leading-normal md:tracking-[0.34em]"
            >
              Physical AI Robotics Platform
            </p>
          </div>
        </div>
      </section>

      <section id="robotics-products" className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pb-3 lg:px-8 lg:pb-4 lg:pt-20">
        <div className="flex justify-end">
          <div className="min-w-0 max-w-xl text-right">
            <p
              className="font-interface text-[11px] font-medium uppercase tracking-[0.32em] text-[#91dfff]"
            >
              Robot Lineup
            </p>
            <h2
              className="font-display mt-4 break-words text-2xl font-semibold leading-[1.12] tracking-[0.04em] text-white md:text-3xl"
            >
              Choose the body, sensors, and access level for the build.
            </h2>
          </div>
        </div>

        <RoboticsMobileProductBrowser products={products} sections={sections} />

        <div data-robotics-desktop-products className="mt-12 hidden gap-y-14 md:grid md:grid-cols-2 md:gap-x-8 xl:grid-cols-5 xl:gap-x-0">
          <div className="hidden xl:block" aria-hidden="true" />
          {products.map((product) => (
            <article
              key={product.name}
              className="group relative min-w-0 xl:px-4"
            >
              <div className="relative flex min-h-[26rem] flex-col">
                <div
                  data-robotics-product-image
                  className="relative h-56 min-w-0 overflow-hidden rounded-lg bg-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-500 group-hover:shadow-[0_24px_70px_rgba(0,0,0,0.34)] md:h-64"
                >
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(min-width: 1280px) 20vw, (min-width: 768px) 50vw, 100vw"
                    className={`${product.imageFit} transition duration-500 group-hover:brightness-105 ${product.imageClass}`}
                    priority={product.name === "FX Navi"}
                  />
                </div>

                <div className="mt-6 flex min-w-0 flex-1 flex-col">
                  <p
                    className={`font-technical min-h-9 text-xs font-semibold leading-[1.45] tracking-[0.18em] ${accentText[product.accent]}`}
                  >
                    {product.package.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </p>
                  <h3
                    className="font-display mt-3 break-words text-2xl font-semibold tracking-[0.04em] text-white"
                  >
                    {product.name}
                  </h3>
                  <p
                    data-robotics-product-price
                    className="font-technical mt-3 text-2xl font-semibold tracking-[0.03em] text-slate-100"
                  >
                    {product.price}
                  </p>
                  <p
                    className="font-interface mt-4 break-words text-sm leading-6 text-slate-400"
                  >
                    {product.summary}
                  </p>

                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section data-robotics-desktop-specifications id="robotics-specs" className="mx-auto hidden max-w-7xl px-3 pb-16 sm:px-5 md:block md:px-6 lg:px-8 lg:pb-24">
        <div className="overflow-x-auto rounded-lg border border-[#1b5f91]/70 bg-[#020509] shadow-[0_32px_110px_rgba(31,183,255,0.08)]">
          <table className="min-w-[960px] w-full border-collapse text-left">
            {sections.map((section) => (
              <tbody key={section.title}>
                <tr className="border-t border-[#1b5f91]/70 first:border-t-0">
                  <th
                    colSpan={5}
                    className="bg-[#04101a] px-5 py-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#91dfff] lg:px-8 lg:py-6"
                  >
                    {section.title}
                  </th>
                </tr>
                {section.rows.map(([label, ...values]) => (
                  <tr key={label} className="border-t border-white/10 transition hover:bg-white/[0.03]">
                    <th className="w-1/5 px-5 py-4 text-sm font-semibold tracking-[0.04em] text-slate-200 lg:px-8 lg:py-5">
                      {label}
                    </th>
                    {values.map((value, index) => (
                      <td
                        key={`${label}-${products[index]?.name ?? index}`}
                        data-robotics-spec-value
                        className={`font-technical w-1/5 break-words border-l border-white/10 px-4 py-4 text-center text-xs font-normal leading-[1.62] tracking-[0.08em] lg:px-6 lg:py-5 ${accentText[products[index]?.accent ?? "aegis"]}`}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#05080c] px-6 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#91dfff]">Agentech Runtime Layer</p>
            <h2
              className="font-display mt-3 break-words text-3xl font-semibold tracking-[0.02em] text-white md:text-4xl"
            >
              Robot bodies become systems when the skill graph sits above them.
            </h2>
            <p
              data-robotics-runtime-copy
              className="font-interface mt-5 max-w-2xl text-xs leading-6 tracking-[0.02em] text-slate-400 md:text-sm md:leading-7"
            >
              The platforms above are the physical layer. Agentech focuses on the runtime, skill graph, and agentic workflow that turn hardware into controllable, repeatable, and increasingly autonomous work.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:justify-self-end">
            {runtimeLevels.map((level) => (
              <div
                key={level}
                data-robotics-runtime-level
                className="font-technical rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[#9fe8d2]"
              >
                {level}
              </div>
            ))}
          </div>
        </div>
        <p
          id="robotics-ordering-remark"
          className="mx-auto mt-8 max-w-7xl text-right text-[10px] leading-5 text-slate-500 opacity-70"
        >
          Remark: ordering availability is pending reseller permit approval.
        </p>
      </section>
      <a
        href="#top"
        aria-label="Back to top"
        data-robotics-back-top
        className="fixed right-4 z-[60] hidden h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/80 text-xs font-semibold tracking-[0.16em] text-white shadow-[0_16px_45px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-white hover:text-black sm:right-6 md:grid"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        TOP
      </a>
    </div>
  );
}
