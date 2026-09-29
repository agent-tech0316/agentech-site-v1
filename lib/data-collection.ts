export const collectionScenarios = [
  { id: "manufacturing", name: "Manufacturing", category: "Industrial", description: "Assembly, tool use, component sorting, and quality inspection.", tasks: "Assembly · Inspection · Sorting", icon: "factory", color: "blue" },
  { id: "logistics", name: "Logistics & warehousing", category: "Industrial", description: "Picking, packing, shelf interaction, and material handling.", tasks: "Pick & place · Packing · Handling", icon: "box", color: "sand" },
  { id: "home", name: "Everyday living", category: "Everyday", description: "Kitchen tasks, tidying, object interaction, and daily routines.", tasks: "Kitchen · Organization · Cleaning", icon: "home", color: "green" },
  { id: "retail", name: "Retail & service", category: "Everyday", description: "Stocking shelves, preparing orders, and service workflows.", tasks: "Restocking · Preparation · Service", icon: "shop", color: "rose" },
  { id: "robotics", name: "Robot teleoperation", category: "Robotics", description: "Task demonstrations with synchronized robot observations and actions.", tasks: "Manipulation · Navigation · Actions", icon: "robot", color: "violet" },
  { id: "custom", name: "Your environment", category: "Custom", description: "A collection plan designed around your task, setting, and model.", tasks: "Your scenario · Your specification", icon: "scan", color: "slate" }
] as const;

export const collectionModalities = ["Egocentric video", "Multi-view video", "RGB-D & spatial", "Robot trajectories", "Multimodal"] as const;
export const collectionFormats = ["MP4 + JSON", "LeRobot", "RLDS", "Custom format"] as const;
export type BuyerProfile = { profileType: "data-buyer"; organization: string; contactName: string; role: string; region: string };
export type ServiceProfileType = "data-buyer" | "development-client";
export type ServiceProfile = Omit<BuyerProfile, "profileType"> & { profileType: ServiceProfileType };
export type CollectionBrief = { id: string; title: string; scenario: string; modality: string; format: string; quantity: number; unit: "hours" | "episodes"; notes: string; status: "Draft"; createdAt: string };
export type BuyerWorkspaceData = { profile: BuyerProfile | null; developmentProfile?: ServiceProfile | null; briefs: CollectionBrief[] };

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function normalizeBuyerProfile(input: unknown): BuyerProfile {
  const value = record(input);
  const organization = text(value.organization, 120);
  const contactName = text(value.contactName, 100);
  if (!organization) throw new Error("Enter your organization name.");
  if (!contactName) throw new Error("Enter your contact name.");
  return { profileType: "data-buyer", organization, contactName, role: text(value.role, 100), region: text(value.region, 100) };
}

export function normalizeServiceProfile(input: unknown): ServiceProfile {
  const value = record(input);
  if (value.profileType !== "data-buyer" && value.profileType !== "development-client") throw new Error("Choose a data buyer or app / website client profile.");
  return { ...normalizeBuyerProfile(value), profileType: value.profileType };
}

export function normalizeCollectionBrief(input: unknown): Omit<CollectionBrief, "id" | "createdAt" | "status"> {
  const value = record(input);
  const title = text(value.title, 120);
  if (!title) throw new Error("Give your project a name.");
  const scenario = text(value.scenario, 40);
  if (!collectionScenarios.some((item) => item.id === scenario)) throw new Error("Choose a collection scenario.");
  const modality = text(value.modality, 60);
  if (!collectionModalities.some((item) => item === modality)) throw new Error("Choose a data modality.");
  const format = text(value.format, 60);
  if (!collectionFormats.some((item) => item === format)) throw new Error("Choose a delivery format.");
  const quantity = typeof value.quantity === "number" ? value.quantity : Number(value.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new Error("Quantity must be a whole number between 1 and 1,000,000.");
  if (value.unit !== "hours" && value.unit !== "episodes") throw new Error("Choose hours or episodes.");
  return { title, scenario, modality, format, quantity, unit: value.unit, notes: text(value.notes, 3000) };
}

export function isLocalBuyerPreview(environment: string | undefined, host: string | null, preview: string | null) {
  return environment === "development" && preview === "1" && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host ?? "");
}

export function isServiceRequestOrigin(origin: string | null, host: string | null, protocol?: string) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && (!protocol || parsed.protocol === protocol) && parsed.host === host && parsed.origin === origin;
  } catch { return false; }
}
