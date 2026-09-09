export type NavItem = {
  label: string;
  href: string;
  menuTriggerHref?: string;
  image?: string;
  activeImage?: string;
  columns?: Array<{
    label: string;
    href?: string;
    children?: Array<{
      label: string;
      href?: string;
    }>;
  }>;
  children?: Array<{
    label: string;
    href: string;
  }>;
};

const defaultComingSoonFeature = { title: "COMING SOON" } as const;

export const comingSoonFeatures = {
  eais: { title: "EAIS" },
  "robotics-rent": { title: "ROBOTICS RENT" },
  "ai-website": { title: "AI-WEBSITE" },
  "ai-app-dev": { title: "AI-APP DEV" },
  "ai-service": { title: "AI-SERVICE" },
  "data-collection": { title: "DATA COLLECTION" }
} as const;

export function resolveComingSoonFeature(feature?: string | string[]) {
  if (typeof feature !== "string") return defaultComingSoonFeature;
  return comingSoonFeatures[feature as keyof typeof comingSoonFeatures] ?? defaultComingSoonFeature;
}

export const navigation: NavItem[] = [
  {
    label: "Platform",
    href: "/agentech-products/eaic",
    menuTriggerHref: "/agentech-products/eaic",
    image: "/assets/logo/AGENTECH-products-grey191.png",
    activeImage: "/assets/logo/AGENTECH-products-solid.png",
    columns: [
      { label: "EAIC", href: "/agentech-products/eaic" },
      { label: "EAIS", href: "/agentech-products/eais" },
      { label: "NAVI STORE", href: "/agentech-education/what-can-we-learn-from-navi" }
    ]
  },
  {
    label: "Service",
    href: "/agentech-robotic",
    menuTriggerHref: "/agentech-robotic",
    image: "/assets/logo/AGENTECH-robotic-grey191.png",
    activeImage: "/assets/logo/AGENTECH-robotic-solid.png",
    columns: [
      { label: "ROBOTICS RENT", href: "/coming-soon?feature=robotics-rent" },
      { label: "ROBOTICS SALE", href: "/agentech-robotic" },
      {
        label: "AI-DEVELOPMENT",
        children: [
          { label: "AI-WEBSITE", href: "/coming-soon?feature=ai-website" },
          { label: "AI-APP DEV", href: "/coming-soon?feature=ai-app-dev" },
          { label: "AI-SERVICE", href: "/coming-soon?feature=ai-service" }
        ]
      },
      { label: "DATA COLLECTION", href: "/coming-soon?feature=data-collection" }
    ]
  },
  {
    label: "Education",
    href: "/agentech-education",
    menuTriggerHref: "/agentech-education",
    image: "/assets/logo/AGENTECH-education-grey191.png",
    activeImage: "/assets/logo/AGENTECH-education-solid.png",
    columns: [
      { label: "K-8", href: "/agentech-education?pathway=grade-k-8#program-pathways" },
      { label: "9-12 HIGH SCHOOL", href: "/agentech-education?pathway=high-school#program-pathways" },
      { label: "UNIVERSITY / COLLEGE", href: "/agentech-education?pathway=university-college#program-pathways" }
    ]
  },
  {
    label: "Talents",
    href: "/talents",
    menuTriggerHref: "/talents",
    image: "/assets/logo/AGENTECH-talents-grey191.png",
    activeImage: "/assets/logo/AGENTECH-talents-solid.png",
    columns: [
      { label: "CLUB", href: "/ai-robotics-club" },
      { label: "INTERN", href: "/career-intern" },
      { label: "WORKSHOP", href: "/tech-education" }
    ]
  }
];

export const company = {
  name: "Agentech",
  tagline: "AI-NATIVE-INFRASTRUCTURE & EMBODIED-INTELLIGENCE",
  heroTitle: "Agentech",
  heroBody: "AI-native robotics and intelligent systems.",
  location: "California / Global Collaboration",
  contactEmail: "info@agent-tech.ai",
  inquiryEmail: "partnerships@agentech.ai",
  socialLinks: [
    { label: "LinkedIn", href: "https://www.linkedin.com/company/agentech" },
    { label: "Facebook", href: "https://www.facebook.com/agentech" },
    { label: "TikTok", href: "https://www.tiktok.com/@agentech" }
  ]
};

export const homeTracks = [
  {
    title: "Agentech Robotic",
    description: "Physical systems designed for useful work in the real world.",
    href: "/agentech-robotic"
  },
  {
    title: "Agentech Education",
    description: "Multi-agent software built for execution, memory, and operational leverage.",
    href: "/agentech-education"
  },
  {
    title: "Agentech Bots",
    description: "Applied experiments exploring what should exist next.",
    href: "/agentech-bots"
  }
];

export const aboutIntro = {
  title: "Leadership and technical members.",
  body: "Agentech team directory."
};

export const leadership = [
  {
    name: "Bill Wang",
    role: "Founder and CEO",
    bio: "",
    emphasis: "primary"
  },
  {
    name: "Mario Li",
    role: "Co-founder and COO",
    bio: "",
    emphasis: "primary"
  },
  {
    name: "Connie Sun",
    role: "Co-founder and Strategy Advisor",
    bio: "",
    emphasis: "primary"
  },
  {
    name: "Xin Gao",
    role: "CTO and Senior Hardware Engineer",
    bio: "",
    emphasis: "secondary"
  },
  {
    name: "Wesley Fan",
    role: "Senior Software Engineer",
    bio: "",
    emphasis: "secondary"
  },
  {
    name: "David Wang",
    role: "Senior Algorithm Engineer",
    bio: "",
    emphasis: "secondary"
  }
];

export const supportTeam: Array<{ name: string; role: string }> = [];

export const exploreMetrics = [
  { label: "Active Projects", value: "06", delta: "Hardware, software, and edge tracks" },
  { label: "Live Workflows", value: "18", delta: "Internal agent loops in motion" },
  { label: "Partner Companies", value: "05", delta: "Early strategic relationships" },
  { label: "Refresh Rhythm", value: "15 min", delta: "Internal operational sync" }
];

export const exploreSignals = [
  "Selected business conversations",
  "Research-driven product iteration",
  "Operational visibility without excess noise"
];

export type ApplicationTrack = {
  id: string;
  title: string;
  summary: string;
  fields: string[];
  asset: string;
  questions: string[];
};

export const applicationIntro = {
  eyebrow: "Application System",
  title: "Applications.",
  body: "A simple structure for different kinds of inbound."
};

export const applicationTracks: ApplicationTrack[] = [
  {
    id: "internship",
    title: "Internship",
    summary: "Early builders.",
    fields: ["Name", "Email", "School / Major", "Location"],
    asset: "Resume / Work Sample",
    questions: [
      "What are you trying to learn right now?",
      "What have you done to push your limits?"
    ]
  },
  {
    id: "full-time",
    title: "Full Time",
    summary: "Long-term builders.",
    fields: ["Name", "Email", "Location", "LinkedIn / Website"],
    asset: "Resume / Portfolio",
    questions: [
      "What is the hardest thing you've built?",
      "What role do you see yourself in?"
    ]
  },
  {
    id: "partnerships",
    title: "Partnerships",
    summary: "External collaboration.",
    fields: ["Name", "Company", "Email", "Location"],
    asset: "Deck / Proposal",
    questions: [
      "What kind of collaboration are you proposing?",
      "What resources or distribution do you bring?"
    ]
  },
  {
    id: "talents",
    title: "Talents",
    summary: "High-signal individuals.",
    fields: ["Name", "Email", "Location", "LinkedIn / Website"],
    asset: "Work / Link / Resume",
    questions: [
      "What do you think deeply about?",
      "Why should we select you?"
    ]
  }
];
