export const workCategories = [
  "for-you", "trending", "humanoids", "robot-arms", "mobile-robots", "quadrupeds", "drones", "education", "simulation"
] as const;

export type WorkCategory = (typeof workCategories)[number];
export type WorkKind = Exclude<WorkCategory, "for-you" | "trending">;

type PrototypeWorkPreview = {
  slug: `prototype-${string}`;
  title: string;
  category: WorkKind;
  summary: string;
  outcome: string;
  image: `/assets/${string}`;
  imageAlt: string;
  process: readonly [string, string, string];
  isFeatured: boolean;
  isPreview: true;
};

type ProjectNote = { title: string; description: string };

type ProjectConcept = {
  problem: string;
  idea: string;
  robot: string;
  hardware: readonly ProjectNote[];
  architecture: readonly ProjectNote[];
  development: readonly ProjectNote[];
  experimentQuestion: string;
  testPlan: readonly ProjectNote[];
};

export type EaisProjectRecord = Omit<ProjectConcept, "experimentQuestion" | "testPlan"> & {
  stage: "concept";
  coverNote: string;
  evidence: { status: "not-run"; question: string; plan: readonly ProjectNote[] };
  demo: { status: "not-published"; description: string };
  team: { status: "not-published"; description: string };
  resources: readonly {
    kind: "code" | "paper" | "eaic-example";
    title: string;
    status: "not-published";
    description: string;
  }[];
};

export type PrototypeWork = PrototypeWorkPreview & { project: EaisProjectRecord };

export const categoryLabels: Record<WorkCategory, string> = {
  "for-you": "For You",
  trending: "Trending",
  humanoids: "Humanoids",
  "robot-arms": "Robot Arms",
  "mobile-robots": "Mobile Robots",
  quadrupeds: "Quadrupeds",
  drones: "Drones",
  education: "Education",
  simulation: "Simulation"
};

const workPreviews = [
  {
    slug: "prototype-night-run-rover",
    title: "Night Run Rover",
    category: "mobile-robots",
    summary: "A calm, after-hours warehouse handoff imagined as a robot’s evening route.",
    outcome: "A quiet delivery moment people can understand at a glance.",
    image: "/assets/eais-showcase/night-run-rover-curious-v1.png",
    imageAlt: "An ivory quadruped robot lifting one front foot in a curious greeting, on a soft gray studio backdrop",
    process: ["Choose a familiar place: the last aisle before lights-out.", "Map a route around people, shelves, and pauses.", "Show the handoff as one simple, visible moment."],
    isFeatured: true,
    isPreview: true
  },
  {
    slug: "prototype-gesture-lab",
    title: "The Gesture Lab",
    category: "humanoids",
    summary: "A humanoid study that asks how a robot can make its next move easy to read.",
    outcome: "A more legible hello, pause, and invitation to collaborate.",
    image: "/assets/robotics/agibot-x2-clean-front.png",
    imageAlt: "A humanoid robot standing front-facing on a clean background",
    process: ["Start with a gesture people already recognize.", "Pair the gesture with a useful moment of work.", "Refine the motion until the intent reads before the explanation."],
    isFeatured: true,
    isPreview: true
  },
  {
    slug: "prototype-sort-at-sight",
    title: "Sort at Sight",
    category: "robot-arms",
    summary: "A visual sorting arm concept for turning a messy workbench into a clear next step.",
    outcome: "A small before-and-after that makes machine vision feel approachable.",
    image: "/assets/eais-showcase/sort-at-sight-concept-v1.png",
    imageAlt: "A compact robotic arm sorting geometric objects across a studio workbench",
    process: ["Collect objects with clearly different shapes and colors.", "Let vision suggest a simple grouping.", "Make each pick visible enough to follow from across the room."],
    isFeatured: false,
    isPreview: true
  },
  {
    slug: "prototype-campus-carry",
    title: "Campus Carry",
    category: "mobile-robots",
    summary: "A friendly delivery companion imagined for the short trip between a studio and a shared table.",
    outcome: "A route that feels like a helpful handoff, not a technical demo.",
    image: "/assets/products/companion-robot.png",
    imageAlt: "A small companion robot on a transparent background",
    process: ["Find one useful trip people repeat every day.", "Make the destination part of the story.", "Design the arrival so a person knows what to do next."],
    isFeatured: false,
    isPreview: true
  },
  {
    slug: "prototype-trail-check",
    title: "Trail Check",
    category: "quadrupeds",
    summary: "A quadruped inspection story for places that are uneven, open, and hard to predict.",
    outcome: "A field walk that shows why a legged robot belongs outdoors.",
    image: "/assets/ff-robotics/ff-official-aegis-robot-dog.jpg",
    imageAlt: "A quadruped robot photographed outdoors",
    process: ["Pick a route with a real change in texture or elevation.", "Give the robot one clear thing to notice.", "Return with a simple visual record of the walk."],
    isFeatured: true,
    isPreview: true
  },
  {
    slug: "prototype-drone-chorus",
    title: "Drone Chorus",
    category: "drones",
    summary: "A swarm study that treats a handful of small flights as a single moving sketch.",
    outcome: "A shared aerial pattern that makes coordination feel playful.",
    image: "/assets/products/drone-v1.png",
    imageAlt: "A drone rendered against a transparent background",
    process: ["Draw the flight as a simple path before adding complexity.", "Give each drone one visible role in the composition.", "Review the pattern from the ground, then refine the spacing."],
    isFeatured: false,
    isPreview: true
  },
  {
    slug: "prototype-build-a-rover-day",
    title: "Build a Rover Day",
    category: "education",
    summary: "A workshop story where a rover becomes a reason to observe, test, and show an idea.",
    outcome: "A project moment that makes learning visible without making promises about results.",
    image: "/assets/ff-robotics/day-6-ai-branded-engineering-sprint.png",
    imageAlt: "A robotics workshop scene with a team building together",
    process: ["Begin with one question the group wants to answer.", "Make a small test that gives everyone a role.", "End by showing what changed after the test."],
    isFeatured: false,
    isPreview: true
  },
  {
    slug: "prototype-before-the-first-move",
    title: "Before the First Move",
    category: "simulation",
    summary: "A simulator-led concept for trying an action several ways before putting it in a room.",
    outcome: "A clearer path from an imagined move to a testable plan.",
    image: "/assets/products/aegis-mujoco-ready.png",
    imageAlt: "A robot shown in a simulation-ready presentation image",
    process: ["Describe the move in ordinary language first.", "Compare the movement in a repeatable simulation scene.", "Keep a record of what each version explains and what it cannot prove."],
    isFeatured: false,
    isPreview: true
  },
  {
    slug: "prototype-walk-together",
    title: "Walk Together",
    category: "humanoids",
    summary: "A motion study focused on the small social signals around walking beside someone.",
    outcome: "A robot movement that feels less like a performance and more like company.",
    image: "/assets/ff-robotics/ff-official-x2-motion-pair.jpg",
    imageAlt: "Two humanoid robots shown in a motion study photograph",
    process: ["Observe how people match pace without thinking about it.", "Create a short sequence of starts, pauses, and turns.", "Keep the story focused on the person beside the robot."],
    isFeatured: false,
    isPreview: true
  }
] as const satisfies readonly PrototypeWorkPreview[];

const projectConcepts: Record<(typeof workPreviews)[number]["slug"], ProjectConcept> = {
  "prototype-night-run-rover": {
    problem: "The last delivery of a shift can still mean a long walk. A useful robot route needs to explain where the parcel is going and when it is ready to collect.",
    idea: "Follow one small parcel from the last warehouse aisle to a staffed handoff point. The interesting moment is the arrival: a pause, a clear signal, and a person taking over.",
    robot: "Proposed indoor mobile carrier; drive platform and payload capacity are undecided. The cover is a reference image, not the selected carrier.",
    hardware: [
      { title: "Mobile base + parcel tray", description: "Choose a stable carrier after defining the parcel size and route. No payload or runtime specification has been validated." },
      { title: "Depth sensing + odometry", description: "A candidate depth camera and wheel encoders would support route observation; coverage would need testing near shelves." },
      { title: "Arrival indicator", description: "A simple light or display would distinguish travelling, waiting, and ready-to-collect states." }
    ],
    architecture: [
      { title: "Observe the aisle", description: "A proposed perception layer marks traversable space and temporary obstacles." },
      { title: "Follow a short route", description: "A waypoint planner requests movement through a platform adapter; no controller is attached to this record." },
      { title: "Make the handoff explicit", description: "An arrival state waits for a deliberate collection acknowledgement before returning." }
    ],
    development: [
      { title: "Map one repeated trip", description: "Sketch the pickup, destination, waiting spots, and places where people cross." },
      { title: "Rehearse the handoff", description: "Use a storyboard to compare a light cue with a short on-screen instruction." },
      { title: "Build the smallest route", description: "Start with an empty controlled mock aisle and record every intervention before considering a busier setting." }
    ],
    experimentQuestion: "Can a person tell that the parcel has arrived without asking the robot’s operator?",
    testPlan: [
      { title: "Clear aisle", description: "Record the route trace, arrival position, and any manual intervention." },
      { title: "Interrupted route", description: "Introduce a stationary obstruction in a controlled test; record how waiting and rerouting are communicated." },
      { title: "Collection moment", description: "Ask a consenting test participant what they believe the robot is waiting for; keep observations separate from completion times." }
    ]
  },
  "prototype-gesture-lab": {
    problem: "A robot can begin moving before the person beside it understands why. Even a hello or an invitation to pass an object needs a readable beginning and end.",
    idea: "Make a tiny vocabulary of hello, wait, and your-turn gestures. Each one should communicate a single intention before a caption explains it.",
    robot: "Proposed humanoid with controllable upper-body gestures; joint limits and control interfaces still need confirmation.",
    hardware: [
      { title: "Upper-body joints", description: "Select a supported subset of head and arm motion after platform limits are documented." },
      { title: "Joint-state feedback", description: "Use reported position and motion state to annotate the gesture; availability is unconfirmed." },
      { title: "Fixed observation camera", description: "Capture the whole gesture from a consistent viewpoint with participant consent." }
    ],
    architecture: [
      { title: "Gesture library", description: "Store each proposed gesture as a short sequence with a clear start, pause, and end." },
      { title: "Intent state machine", description: "Choose one gesture at a time and expose the current intention to an operator." },
      { title: "Motion adapter", description: "Translate a reviewed sequence only after a real platform interface and constraints are available." }
    ],
    development: [
      { title: "Draw the intention", description: "Storyboard three everyday social moments and remove unnecessary motion." },
      { title: "Compare silhouettes", description: "Explore pose timing in animation before any hardware trial." },
      { title: "Review what people read", description: "Ask consenting viewers to describe each silent clip without leading questions." }
    ],
    experimentQuestion: "Which part of a gesture makes the robot’s intention understandable?",
    testPlan: [
      { title: "Without a caption", description: "Record the intention viewers infer, including uncertain or conflicting interpretations." },
      { title: "Different viewpoints", description: "Compare front and side views to identify gestures that disappear from one angle." },
      { title: "Timing variations", description: "Compare proposed pause lengths while keeping the pose sequence fixed." }
    ]
  },
  "prototype-sort-at-sight": {
    problem: "A busy workbench is easy to understand until the robot has to choose what belongs where. Similar colors, overlapping parts, and an awkward grasp can each change the answer.",
    idea: "Give a small arm a modest job: group a few geometric objects into two trays. Show the object it has chosen, the reason for the grouping, and the moment it changes its mind.",
    robot: "Proposed benchtop robot arm with a parallel gripper. A specific arm, reach, payload, and controller have not been selected or validated.",
    hardware: [
      { title: "Arm + parallel gripper", description: "A candidate arm would need enough reach for both trays. Finger geometry and grasp force depend on the eventual objects and hardware." },
      { title: "Overhead RGB-D camera", description: "A proposed color and depth view would locate the objects on the table. Calibration, occlusion, and reflective surfaces need separate checks." },
      { title: "Two trays + varied objects", description: "Start with matte objects of distinct shapes. Mark the table and tray positions so repeated tests can be compared." },
      { title: "Local compute + operator control", description: "A candidate workstation would run perception and planning. A qualified operator must define the hardware setup and stop controls before a physical trial." }
    ],
    architecture: [
      { title: "See and name", description: "A proposed vision pipeline segments objects, estimates their table positions, and attaches a confidence value. The model and training data are not selected." },
      { title: "Choose and plan", description: "A simple grouping rule selects a tray. A grasp planner proposes a reachable pick; ambiguous objects should remain unpicked for operator review." },
      { title: "Act and check", description: "A platform adapter would request one reviewed move at a time. A fresh image checks the object’s destination instead of assuming the command succeeded." }
    ],
    development: [
      { title: "Begin with a still image", description: "Label a small set of tabletop scenes and compare predicted groups with manually reviewed labels. Save mistakes, especially overlaps and confusing colors." },
      { title: "Make the choice visible", description: "Mock the selected object and destination overlay. A viewer should understand the next pick before the arm moves." },
      { title: "Move from one pick to a sequence", description: "After platform-specific review, an initial hardware test would use a single object. Add objects only with recorded grasp outcomes and documented setup changes." }
    ],
    experimentQuestion: "Can the system explain each pick and detect when the object did not reach its intended tray?",
    testPlan: [
      { title: "Easy objects first", description: "Use separated matte objects. Record the predicted class, selected tray, grasp attempt, observed placement, and human correction for each trial." },
      { title: "Change the scene", description: "Vary lighting and introduce partial overlaps. Compare uncertainty and intervention counts with the baseline; do not omit failed picks." },
      { title: "Check the final result", description: "Manually review the tray contents against the scene log. Report the number of trials and setup conditions alongside any eventual success rate." }
    ]
  },
  "prototype-campus-carry": {
    problem: "Moving a shared tool between rooms interrupts the person who is using it next. A delivery companion needs to make that short trip and its destination easy to understand.",
    idea: "Imagine carrying a lightweight studio item to a shared table. The project follows the request, the short route, and the person receiving it.",
    robot: "Proposed indoor companion carrier; the pictured robot is illustrative and its carrying capability is not established.",
    hardware: [
      { title: "Carrier + secured tray", description: "Choose the base and load holder after checking the item’s dimensions and platform limits." },
      { title: "Depth camera + localization", description: "Candidate sensing would support a mapped indoor route; doorways and localization loss need evaluation." },
      { title: "Destination display", description: "A visible destination label would help the recipient distinguish an arrival from a temporary pause." }
    ],
    architecture: [
      { title: "Simple delivery request", description: "Choose from a small set of named destinations rather than interpreting an unrestricted request." },
      { title: "Route + pause states", description: "A proposed navigation layer tracks progress and exposes interruptions for operator review." },
      { title: "Recipient acknowledgement", description: "An explicit handoff state records collection; no messaging or account integration exists." }
    ],
    development: [
      { title: "Choose one useful trip", description: "Document the pickup, destination, and what the recipient expects to see." },
      { title: "Prototype the arrival", description: "Compare a destination label and a simple arrival cue with a tabletop storyboard." },
      { title: "Record the whole journey", description: "Plan a controlled route trial including waits, failed arrivals, and operator interventions." }
    ],
    experimentQuestion: "Does the arrival explain where the item is going and who should collect it?",
    testPlan: [
      { title: "One destination", description: "Record whether a viewer correctly identifies the intended table from the display." },
      { title: "A blocked doorway", description: "In a controlled setup, log the wait state and how a route interruption is resolved." },
      { title: "No recipient", description: "Review the proposed timeout and return behavior without claiming unattended operation." }
    ]
  },
  "prototype-trail-check": {
    problem: "A rough outdoor path makes repeatable inspection difficult. The useful result is a clear record of what changed, including where the robot could not get a usable view.",
    idea: "Follow a short legged-robot walk to a few marked inspection points. Bring back a small visual field notebook with locations, observations, and unanswered questions.",
    robot: "Proposed quadruped inspection platform; terrain capability, weather limits, and sensor support require confirmation.",
    hardware: [
      { title: "Quadruped platform", description: "Select the robot after surveying the route and documenting platform restrictions." },
      { title: "Inspection camera", description: "A candidate fixed or stabilized camera would capture comparable views at marked stops." },
      { title: "IMU + position reference", description: "Proposed inertial and location data would annotate observations; accuracy is unknown." }
    ],
    architecture: [
      { title: "Route notebook", description: "A short list of operator-reviewed waypoints links each stop to an expected observation." },
      { title: "Capture + annotate", description: "Associate a captured view with time and location, and mark unusable frames explicitly." },
      { title: "Human review", description: "Compare observations manually first; automated change detection is a possible later experiment." }
    ],
    development: [
      { title: "Survey the path", description: "Record terrain transitions and locations that are outside the proposed scope." },
      { title: "Choose repeatable views", description: "Use a fixed observation checklist and a reference camera position." },
      { title: "Compare two visits", description: "Plan paired captures and describe differences alongside missing or uncertain data." }
    ],
    experimentQuestion: "Can two visits produce observations that a person can usefully compare?",
    testPlan: [
      { title: "View consistency", description: "Record framing differences and image quality at every marked stop." },
      { title: "Terrain transition", description: "In an approved controlled trial, log interruptions and places an operator chooses not to enter." },
      { title: "Missed observation", description: "Check that missing captures remain visible in the report instead of being interpreted as no change." }
    ]
  },
  "prototype-drone-chorus": {
    problem: "Several moving points can look like a pattern or a jumble. A coordination study needs to make each aircraft’s role and the shared timing legible.",
    idea: "Sketch one aerial phrase: separate, gather, and pause. Start as a simulation so the pattern can be studied from the audience’s viewpoint.",
    robot: "Proposed simulated group of small quadrotors; no physical flight platform or flight location has been approved.",
    hardware: [
      { title: "Simulation workstation", description: "Begin with virtual aircraft and a repeatable scene; a physical fleet is not part of this record." },
      { title: "Position feedback model", description: "Model noisy position updates instead of assuming perfect knowledge of every aircraft." },
      { title: "Future flight setup", description: "Any physical extension would need a suitable controlled venue, qualified supervision, and documented aircraft capabilities." }
    ],
    architecture: [
      { title: "Shared score", description: "Represent the phrase as timed formation targets that can be inspected before playback." },
      { title: "Per-aircraft paths", description: "A proposed planner derives individual paths and checks simulated separation." },
      { title: "Playback observer", description: "Log timing drift and formation error; simulated checks do not certify physical flights." }
    ],
    development: [
      { title: "Draw one phrase", description: "Storyboard the intended pattern from the ground." },
      { title: "Simulate individual roles", description: "Compare the shape with a small number of virtual aircraft before increasing complexity." },
      { title: "Introduce imperfect timing", description: "Vary simulated delay and position noise, keeping the failed patterns in the comparison." }
    ],
    experimentQuestion: "How much timing drift changes a readable pattern into an unclear one?",
    testPlan: [
      { title: "Ideal playback", description: "Capture the initial simulated paths and audience view as a comparison baseline." },
      { title: "Delayed participant", description: "Delay one virtual aircraft and record formation error and minimum modeled separation." },
      { title: "Changed viewpoint", description: "Compare the phrase from multiple ground viewpoints using the same simulated run." }
    ]
  },
  "prototype-build-a-rover-day": {
    problem: "A workshop can finish with a moving robot but little evidence of what the group discovered. The process should make observations and revisions easy to show.",
    idea: "Ask one small question: what changes when a rover follows a different path? Give building, observing, and recording equally useful roles.",
    robot: "Proposed educational wheeled rover kit; age suitability, parts, and supervision have not been selected.",
    hardware: [
      { title: "Rover kit", description: "Choose an appropriate low-complexity kit after the workshop audience and supervision plan are defined." },
      { title: "Line or distance sensor", description: "Select one observable input so the group can connect a reading with a decision." },
      { title: "Marked course + notebook", description: "Keep the route consistent and record changes with sketches, measurements, or anonymized photos." }
    ],
    architecture: [
      { title: "Read one input", description: "Show the sensor reading in a form the group can compare with the scene." },
      { title: "Choose a small rule", description: "A simple proposed rule links the observation to a turn or stop." },
      { title: "Explain the revision", description: "Keep the before and after settings beside the observation; no learning outcomes are claimed." }
    ],
    development: [
      { title: "Write the question", description: "Choose a question that can be explored in one short course." },
      { title: "Change one thing", description: "Keep an initial trial and then vary one setting so differences can be discussed." },
      { title: "Show the evidence", description: "Prepare a simple project board with the question, observations, and remaining uncertainty." }
    ],
    experimentQuestion: "Can the group explain what it changed using an observation from the course?",
    testPlan: [
      { title: "Initial attempt", description: "Record the chosen rule and the rover’s observable path, including stops and errors." },
      { title: "One revision", description: "Change one setting and record what differs under the same course conditions." },
      { title: "Project reflection", description: "Collect anonymous observations if consent permits; do not infer educational effectiveness from one activity." }
    ]
  },
  "prototype-before-the-first-move": {
    problem: "A motion can look convincing in simulation while depending on assumptions that will not hold on hardware. Those assumptions deserve a place beside the result.",
    idea: "Explore one short movement several ways. Keep the visual comparison together with the model settings and the reasons each version might behave differently on a real robot.",
    robot: "Proposed simulated legged robot; the model, controller, and correspondence with a physical platform are unverified.",
    hardware: [
      { title: "Simulation workstation", description: "A candidate local machine would run the model and save reproducible scene configurations." },
      { title: "Virtual joints + sensors", description: "Use modeled joint and inertial observations, explicitly marked as simulated data." },
      { title: "Documented robot model", description: "Record mass, geometry, and contact assumptions before comparing any motion." }
    ],
    architecture: [
      { title: "Scene configuration", description: "Version the initial pose, surface, model parameters, and requested motion." },
      { title: "Controller experiment", description: "Compare a small number of controller settings under the same initial conditions." },
      { title: "Trace + replay", description: "Save the simulated trajectory and observations together with failed runs and limitations." }
    ],
    development: [
      { title: "Define the visible action", description: "Describe a short start, move, and stop in ordinary language." },
      { title: "Keep a comparison baseline", description: "Hold the scene constant and change one parameter per comparison." },
      { title: "Write down the gap", description: "List what the model omits before proposing any platform-specific hardware test." }
    ],
    experimentQuestion: "Which assumptions have the largest effect on the modeled movement?",
    testPlan: [
      { title: "Repeat the baseline", description: "Save the seed, configuration, and trace to check whether the simulated result is reproducible." },
      { title: "Vary one assumption", description: "Compare contact or delay assumptions individually and retain unstable runs." },
      { title: "Review the limits", description: "Document unmodeled effects and avoid treating a simulation pass as physical validation." }
    ]
  },
  "prototype-walk-together": {
    problem: "Walking beside someone is full of small negotiations. People slow down, leave room, and stop to look at something. A companion robot would need to notice those changes without making the person manage every step.",
    idea: "Study a short shared walk: start together, turn a corner, then pause. The question is whether the robot’s intention feels readable to the person beside it.",
    robot: "Proposed humanoid walking companion. The pictured humanoids are visual references; this record does not establish a supported locomotion interface or tested platform.",
    hardware: [
      { title: "Humanoid platform", description: "Select a platform only after its walking interface, operating constraints, and operator requirements are documented." },
      { title: "Depth camera for person tracking", description: "A proposed local perception pipeline would estimate relative position. Occlusion, limited field of view, and lighting need evaluation." },
      { title: "IMU + motion feedback", description: "Candidate platform feedback would help describe the robot’s own movement. Signals and update rates have not been confirmed." },
      { title: "Controlled observation setup", description: "Start with simulation and storyboard review. Any later physical walk needs an approved setup, a qualified operator, and consenting participants." }
    ],
    architecture: [
      { title: "Notice a change of pace", description: "A proposed person-tracking module estimates relative position and uncertainty. It should surface lost tracking instead of guessing a new target." },
      { title: "Choose a social state", description: "A small state machine distinguishes ready, accompanying, and paused. Study the transition cues before choosing a complex learned policy." },
      { title: "Request reviewed movement", description: "A platform-specific adapter would translate an intended pace into supported commands. It would need independent constraints and validation before hardware use." }
    ],
    development: [
      { title: "Watch the small moments", description: "Storyboard a person starting, slowing, turning, and stopping. Describe what a nearby companion should make visible in each moment." },
      { title: "Prototype the shared rhythm", description: "Animate a short side-by-side route and compare different pause cues. Ask viewers to describe what they expect to happen next." },
      { title: "Design a measurable trial", description: "Define how to record relative spacing, tracking interruptions, operator intervention, and participant feedback. Hardware trials remain a later step." }
    ],
    experimentQuestion: "When the person slows or stops, can they understand what the robot intends to do next?",
    testPlan: [
      { title: "Start and pause", description: "Begin with a simulated straight route. Record state transitions and relative spacing, then ask viewers to describe the pause cue without a caption." },
      { title: "A gentle turn", description: "Compare the same route with a corner. Inspect spacing changes and where the proposed tracking view loses the person." },
      { title: "Lost tracking", description: "Introduce an occlusion in simulation. Record whether uncertainty is visible and the proposed movement request pauses. This is a software test plan, not evidence of physical safety." }
    ]
  }
};

export const prototypeWorks: readonly PrototypeWork[] = workPreviews.map((work) => {
  const { experimentQuestion, testPlan, ...concept } = projectConcepts[work.slug];
  return {
    ...work,
    project: {
      ...concept,
      stage: "concept",
      coverNote: "Illustrative cover from the concept library; not footage or evidence of this project being built.",
      evidence: { status: "not-run", question: experimentQuestion, plan: testPlan },
      demo: { status: "not-published", description: "No project demo has been published. A future demo should show the setup, a complete attempt, and any intervention." },
      team: { status: "not-published", description: "This is a concept record template. A creator or team has not been assigned; no community authorship is claimed." },
      resources: [
        { kind: "code", title: "Project code", status: "not-published", description: "No repository or downloadable implementation has been provided." },
        { kind: "paper", title: "Paper / write-up", status: "not-published", description: "No research paper or supporting technical publication has been provided." },
        { kind: "eaic-example", title: "EAIC project example", status: "not-published", description: "No runnable EAIC example is attached to this record." }
      ]
    }
  };
});

export function findEaisProject(slug: string): PrototypeWork | undefined {
  return prototypeWorks.find((work) => work.slug === slug);
}

export function filterEaisWorks(category: WorkCategory, query: string): readonly PrototypeWork[] {
  const search = query.trim().toLocaleLowerCase();
  return prototypeWorks.filter((work) => {
    const isInCategory = category === "for-you"
      || (category === "trending" ? work.isFeatured : work.category === category);
    const { project } = work;
    const searchableNotes = [...project.hardware, ...project.architecture, ...project.development];
    const searchText = [work.title, work.summary, work.outcome, categoryLabels[work.category], project.problem, project.idea, project.robot,
      ...searchableNotes.flatMap((note) => [note.title, note.description])].join(" ").toLocaleLowerCase();
    return isInCategory && (!search || searchText.includes(search));
  });
}

export type EaisPaginationToken = number | "ellipsis";

export type EaisPaginationPage<T> = {
  items: readonly T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  start: number;
  end: number;
};

export function orderEaisWorksFeaturedFirst<T extends { isFeatured: boolean }>(works: readonly T[]): readonly T[] {
  const featured: T[] = [];
  const remaining: T[] = [];
  for (const work of works) (work.isFeatured ? featured : remaining).push(work);
  return [...featured, ...remaining];
}

export function paginateEaisWorks<T>(items: readonly T[], requestedPage: number, pageSize: number): EaisPaginationPage<T> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError("EAIS page size must be a positive integer");
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const normalizedPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const currentPage = totalPages === 0 ? 1 : Math.min(totalPages, Math.max(1, normalizedPage));
  const offset = (currentPage - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    currentPage,
    totalPages,
    totalItems,
    start: totalItems === 0 ? 0 : offset + 1,
    end: Math.min(offset + pageSize, totalItems)
  };
}

export function getEaisPaginationTokens(requestedPage: number, totalPages: number): readonly EaisPaginationToken[] {
  if (totalPages < 1) return [];
  const currentPage = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage)));
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (currentPage >= totalPages - 3) return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
}
