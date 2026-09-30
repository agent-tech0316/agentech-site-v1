export type MotionCategory =
  | "Locomotion"
  | "Sports"
  | "Gestures"
  | "Dance"
  | "Combat"
  | "Utility";

export type MotionPreview =
  | {
      type: "placeholder";
      motif: "arc" | "stride" | "burst" | "wave" | "impact" | "rhythm" | "reach" | "lower" | "rise";
      src?: never;
    }
  | {
      type: "image" | "video" | "webgl" | "model";
      src?: string;
      motif?: never;
    };

export type MotionProduct = {
  id: string;
  slug: string;
  name: string;
  category: MotionCategory;
  description: string;
  status: "Coming Soon";
  price?: string;
  featured: boolean;
  preview: MotionPreview;
  metadata: {
    motionType: string;
    duration: string;
    compatibility: string;
    format: string;
    version: string;
  };
};

export const motionCategories: readonly MotionCategory[] = [
  "Locomotion",
  "Sports",
  "Gestures",
  "Dance",
  "Combat",
  "Utility"
];

const sharedMetadata = {
  compatibility: "Robot profile pending",
  format: "Motion package",
  version: "Preview 0.1"
} as const;

export const motionCatalog: readonly MotionProduct[] = [
  {
    id: "motion-golf-swing",
    slug: "golf-swing",
    name: "Golf Swing",
    category: "Sports",
    description: "A complete golf swing motion sequence.",
    status: "Coming Soon",
    featured: true,
    preview: { type: "placeholder", motif: "arc" },
    metadata: { motionType: "Full-body sport", duration: "2.8 sec", ...sharedMetadata }
  },
  {
    id: "motion-walk-forward",
    slug: "walk-forward",
    name: "Walk Forward",
    category: "Locomotion",
    description: "Natural forward walking motion.",
    status: "Coming Soon",
    featured: true,
    preview: { type: "placeholder", motif: "stride" },
    metadata: { motionType: "Cyclic locomotion", duration: "Loop", ...sharedMetadata }
  },
  {
    id: "motion-run",
    slug: "run",
    name: "Run",
    category: "Locomotion",
    description: "Dynamic forward running motion.",
    status: "Coming Soon",
    featured: true,
    preview: { type: "placeholder", motif: "burst" },
    metadata: { motionType: "Dynamic locomotion", duration: "Loop", ...sharedMetadata }
  },
  {
    id: "motion-wave",
    slug: "wave",
    name: "Wave",
    category: "Gestures",
    description: "Natural one-arm greeting.",
    status: "Coming Soon",
    featured: true,
    preview: { type: "placeholder", motif: "wave" },
    metadata: { motionType: "Upper-body gesture", duration: "1.6 sec", ...sharedMetadata }
  },
  {
    id: "motion-boxing-combo",
    slug: "boxing-combo",
    name: "Boxing Combo",
    category: "Combat",
    description: "Multi-step boxing movement.",
    status: "Coming Soon",
    featured: true,
    preview: { type: "placeholder", motif: "impact" },
    metadata: { motionType: "Full-body combat", duration: "3.2 sec", ...sharedMetadata }
  },
  {
    id: "motion-dance-01",
    slug: "dance-01",
    name: "Dance 01",
    category: "Dance",
    description: "Full-body rhythmic movement.",
    status: "Coming Soon",
    featured: true,
    preview: { type: "placeholder", motif: "rhythm" },
    metadata: { motionType: "Full-body choreography", duration: "8.0 sec", ...sharedMetadata }
  },
  {
    id: "motion-pick-up-object",
    slug: "pick-up-object",
    name: "Pick Up Object",
    category: "Utility",
    description: "Reach, grab and lift sequence.",
    status: "Coming Soon",
    featured: false,
    preview: { type: "placeholder", motif: "reach" },
    metadata: { motionType: "Object interaction", duration: "3.6 sec", ...sharedMetadata }
  },
  {
    id: "motion-sit-down",
    slug: "sit-down",
    name: "Sit Down",
    category: "Utility",
    description: "Controlled standing-to-seated movement.",
    status: "Coming Soon",
    featured: false,
    preview: { type: "placeholder", motif: "lower" },
    metadata: { motionType: "Posture transition", duration: "2.4 sec", ...sharedMetadata }
  },
  {
    id: "motion-stand-up",
    slug: "stand-up",
    name: "Stand Up",
    category: "Utility",
    description: "Controlled seated-to-standing movement.",
    status: "Coming Soon",
    featured: false,
    preview: { type: "placeholder", motif: "rise" },
    metadata: { motionType: "Posture transition", duration: "2.5 sec", ...sharedMetadata }
  }
];

export const featuredMotions = motionCatalog.filter((motion) => motion.featured);
