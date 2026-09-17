import type { AgentechFunction, AgentechParam } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";

type Hand = "left" | "right" | "both";
export type MasterActionVariant = Hand | "fixed";
export type MasterActionDocumentation = Omit<AgentechFunction, "params" | "profiles" | "verification"> & {
  definition: string;
  params: (AgentechParam & { allowedValues?: string[]; allowedRange?: string })[];
  configurations?: { value: Hand; label: string; title: string; syntax: string; description: string }[];
  verifiedVariants?: MasterActionVariant[];
  note?: string;
};

// Display-only documentation. No runtime validation or robot behavior lives here.
// Checked against agentech_sdk@095ebe3a37f642462a50fa9d375a1316de5b46ec:
// agentech/robots/master/api.py (public methods, center, stay, and heart overloads)
// agentech/robots/master/arms/presets/standing.py (hand values and verification)
// agentech/robots/master/README.md (standing presets and inactive seated work).
const handParameter = (description: string, values: Hand[] = ["left", "right"], defaultValue?: string) => ({
  name: "hand", type: "string", description, defaultValue,
  allowedValues: values.map((value) => `"${value}"`)
});

function handAction(
  name: string,
  summary: string,
  definition: string,
  optionTitle: string,
  description: (hand: "left" | "right") => string,
  exampleComment: (hand: "left" | "right") => string,
  parameterDescription: string,
  verifiedVariants: Hand[]
): MasterActionDocumentation {
  return {
    name, category: "Actions", signature: `Agentech.${name}(hand)`, summary, definition,
    configurations: (["left", "right"] as const).map((value) => ({
      value,
      label: value === "left" ? "Left" : "Right",
      title: `${value === "left" ? "Left" : "Right"}-hand ${optionTitle}`,
      syntax: `Agentech.${name}("${value}")`,
      description: description(value)
    })),
    params: [handParameter(parameterDescription)],
    example: (["left", "right"] as const).map((value) => `# ${exampleComment(value)}\nAgentech.${name}("${value}")`).join("\n\n"),
    verifiedVariants
  };
}

function fixedAction(name: string, summary: string, definition: string, exampleComment: string): MasterActionDocumentation {
  return {
    name, category: "Actions", signature: `Agentech.${name}()`, summary, definition,
    params: [], example: `# ${exampleComment}\nAgentech.${name}()`, verifiedVariants: ["fixed"]
  };
}

export const masterActionFunctions: MasterActionDocumentation[] = [
  handAction(
    "wave", "Wave with Master's left or right hand while standing.",
    "Master stays standing in place throughout the wave. Choose one hand below; the call waits for the gesture to finish before returning.",
    "wave", (hand) => `Wave with Master's ${hand} hand while remaining standing in place.`,
    (hand) => `Wave with the ${hand} hand`, "Selects which hand Master uses to perform the wave.", ["right"]
  ),
  handAction(
    "blow_kiss", "Blow a kiss with Master's left or right hand.",
    "Master performs the kiss gesture with the selected hand while staying in place. The call waits for the gesture to finish and confirms Master is standing afterward.",
    "kiss", (hand) => `Blow a kiss with Master's ${hand} hand while standing.`,
    (hand) => `Blow a kiss with the ${hand} hand`, "Selects which hand Master uses to blow a kiss.", ["left", "right"]
  ),
  handAction(
    "raise_hand", "Raise Master's left or right hand while standing.",
    "Master lifts the selected hand using a single-arm standing gesture. Use raise_hands() when you want the coordinated both-hands action.",
    "raise", (hand) => `Raise Master's ${hand} hand while standing.`,
    (hand) => `Raise the ${hand} hand`, "Selects which hand Master raises.", ["right"]
  ),
  handAction(
    "salute", "Salute with Master's left or right hand.",
    "Master performs the salute with the selected hand and remains standing. The call waits until the gesture is complete.",
    "salute", (hand) => `Salute with Master's ${hand} hand while standing.`,
    (hand) => `Salute with the ${hand} hand`, "Selects which hand Master uses to salute.", ["right"]
  ),
  {
    name: "heart", category: "Actions",
    signature: 'Agentech.heart(hand="both", *, posture=None, operator_ready=False, feet_planted=False)',
    summary: "Make a heart with Master's left hand, right hand, or both hands.",
    definition: "Choose a one-hand heart or the coordinated two-hand gesture. Omitting hand uses both hands. The examples and previews below show the standing action.",
    configurations: (["left", "right", "both"] as const).map((value) => ({
      value,
      label: value === "both" ? "Both" : value === "left" ? "Left" : "Right",
      title: value === "both" ? "Both-hands heart" : `${value === "left" ? "Left" : "Right"}-hand heart`,
      syntax: `Agentech.heart("${value}")`,
      description: value === "both" ? "Make a heart with both hands while standing. This is the default." : `Make a heart with Master's ${value} hand while standing.`
    })),
    params: [
      handParameter("Selects the hand configuration for the standing heart.", ["left", "right", "both"], '"both"'),
      { name: "posture", type: "string | None", defaultValue: "None", allowedValues: ['"stand"', '"sit"', "None"], description: 'None selects standing. "sit" selects the separate seated path, retained as inactive work in the source documentation.' },
      { name: "operator_ready", type: "boolean", defaultValue: "False", allowedValues: ["False", "True"], description: "Operator confirmation for the seated path; live seated calls require True. Unused by the standing gesture." },
      { name: "feet_planted", type: "boolean", defaultValue: "False", allowedValues: ["False", "True"], description: "Feet-planted confirmation for the seated path; live seated calls require True. Unused by the standing gesture." }
    ],
    note: 'The SDK also accepts "stand" or "sit" as a positional posture selector for a both-hands heart. The seated path requires its own supported seated controller and supervision; the standing previews do not represent it.',
    example: '# Make a heart with the left hand\nAgentech.heart("left")\n\n# Make a heart with the right hand\nAgentech.heart("right")\n\n# Make a heart with both hands (the default)\nAgentech.heart("both")\nAgentech.heart()',
    verifiedVariants: ["both"]
  },
  handAction(
    "handshake", "Offer Master's left or right hand for a handshake.",
    "Master presents the selected hand using its standing handshake gesture. The hand selection chooses the arm used for the action; the call waits for completion.",
    "handshake", (hand) => `Offer Master's ${hand} hand for a handshake while standing.`,
    (hand) => `Offer the ${hand} hand for a handshake`, "Selects which hand Master offers.", ["left", "right"]
  ),
  handAction(
    "high_five", "Raise Master's left or right hand for a high-five.",
    "Master presents the selected hand for a high-five while staying standing. This is a complete gesture; the call waits until it finishes.",
    "high-five", (hand) => `Raise Master's ${hand} hand for a high-five while standing.`,
    (hand) => `Offer a high-five with the ${hand} hand`, "Selects which hand Master raises for a high-five.", ["left", "right"]
  ),
  fixedAction("clap", "Clap Master's hands together while standing.", "Both arms move together in the clap gesture. No hand selection is needed; the call waits for the complete action.", "Clap both hands"),
  fixedAction("cross_arms", "Cross Master's arms in front of the body.", "Master moves both arms together into the standing cross-arms gesture. This is a fixed action with no hand selector.", "Cross both arms"),
  handAction(
    "chest_wave", "Wave Master's left or right hand at chest height.",
    "Master performs the chest-height wave with one selected hand while standing. This uses a different gesture from wave(); the call waits for completion.",
    "chest wave", (hand) => `Wave Master's ${hand} hand at chest height while standing.`,
    (hand) => `Wave the ${hand} hand at chest height`, "Selects which hand Master waves at chest height.", ["left", "right"]
  ),
  fixedAction("hug", "Make a hugging gesture with both of Master's arms.", "Master moves both arms together through the standing hug gesture. No hand selection is needed; the call waits for the complete action.", "Perform the both-arms hug gesture"),
  fixedAction("cheer", "Cheer with Master's left hand while standing.", "This gesture always uses the left hand. The hand is fixed by the action, so cheer() takes no hand argument.", "Perform the fixed left-hand cheer"),
  fixedAction("wave_goodbye", "Wave goodbye with Master's left hand.", "Master performs the fixed left-hand goodbye gesture while standing. Use wave(hand) for the separate wave action with a selectable hand.", "Perform the fixed left-hand goodbye wave"),
  fixedAction("raise_hands", "Raise both of Master's hands while standing.", "Both arms move together in the coordinated hands-up gesture. Use raise_hand(hand) to select just one hand.", "Raise both hands together"),
  fixedAction("bow", "Make a standing bow with Master.", "Master performs its fixed bow gesture and returns to stable standing. The call waits for completion; no angle or hand argument is accepted.", "Perform the standing bow"),
  fixedAction("scratch_head", "Scratch Master's head with the left hand.", "The scratch-head gesture always uses the left hand while Master stands. This action does not accept a right-hand option.", "Perform the fixed left-hand scratch-head gesture"),
  {
    name: "center", category: "Actions", signature: "Agentech.center()",
    summary: "Return Master's head to its saved center.",
    definition: "Turns the head back to its saved yaw center for the active standing or seated posture. Requires a stable supported posture; it does not recenter the whole body.",
    params: [], example: "# Return the head to its saved center\nAgentech.center()"
  },
  {
    name: "stay", category: "Actions", signature: "Agentech.stay(seconds=1.0)",
    summary: "Keep Master's current pose for a chosen number of seconds.",
    definition: "Pauses the program while the active controller keeps its current joint targets and stiffness. This command does not start a new movement or change the controller.",
    params: [{ name: "seconds", type: "number", defaultValue: "1.0", allowedRange: "0 < seconds ≤ 300", description: "How long to wait, in seconds. Must be a positive finite number, up to 300 seconds." }],
    example: "# Wait for the default one second\nAgentech.stay()\n\n# Wait for one second explicitly\nAgentech.stay(1.0)\n\n# Wait for three seconds\nAgentech.stay(seconds=3.0)"
  }
];

export function masterActionPreviewCall(action: MasterActionDocumentation, variant: MasterActionVariant): string | undefined {
  if (action.configurations) return action.configurations.find((configuration) => configuration.value === variant)?.syntax;
  return variant === "fixed" ? `Agentech.${action.name}()` : undefined;
}

export function masterActionVerification(action: MasterActionDocumentation, variant: MasterActionVariant): string | undefined {
  if (!action.verifiedVariants?.includes(variant)) return undefined;
  return variant === "fixed"
    ? "Physical robot verification: Verified on Master."
    : `Physical robot verification: ${variant === "both" ? "Both-hands" : variant[0].toUpperCase() + variant.slice(1)} variant verified.`;
}
