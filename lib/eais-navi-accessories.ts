export const NAVI_ACCESSORY_COLLECTION = "NAVI — Robot Accessories" as const;

export type EaisAccessoryAsset = {
  sourceRelativePath: `${string}/${string}.png`;
  publicPath: `/assets/eais-showcase/navi-robot-accessories/${string}/${string}.png`;
  label: string;
  sha256: string;
  width: number;
  height: number;
};

export type NaviAccessoryWork = {
  slug: `navi-accessories-${string}`;
  title: string;
  category: "quadrupeds";
  summary: string;
  outcome: string;
  image: `/assets/eais-showcase/navi-robot-accessories/${string}/${string}.png`;
  imageAlt: string;
  isFeatured: false;
  isPreview: true;
  availability: "unavailable";
  collection: typeof NAVI_ACCESSORY_COLLECTION;
  accessoryCategory: string;
  description: string;
  assets: readonly EaisAccessoryAsset[];
};

function accessoryAsset(
  group: string,
  filename: `${string}.png`,
  label: string,
  sha256: string,
  width = 4096,
  height = 6144
): EaisAccessoryAsset {
  return {
    sourceRelativePath: `${group}/${filename}`,
    publicPath: `/assets/eais-showcase/navi-robot-accessories/${group}/${filename}`,
    label,
    sha256,
    width,
    height
  };
}

const helmetAssets = [
  accessoryAsset("helmet-four-themes", "01-orbit-explorer.png", "Orbit Explorer", "ec2babcc5380f273d9880acfc1d68a22ce8c6e29a2c39491b19b89b13f811192"),
  accessoryAsset("helmet-four-themes", "02-crimson-kabuto.png", "Crimson Kabuto", "43a1e978cdfb95ea10abbe6e30c760925ab3a003d9b0b17bf65646ab1952f7c8"),
  accessoryAsset("helmet-four-themes", "03-abyss-diver.png", "Abyss Diver", "696e5d448a0e9b5b6d7dd8dad1728803e758ddca37d1759c745441b695ac0957"),
  accessoryAsset("helmet-four-themes", "04-neon-velocity.png", "Neon Velocity", "679593e1dd80b462613109a39c4457a41212ef3b4da56cfce0281aadca64cd0d")
] as const;

const shoulderAssets = [
  accessoryAsset("shoulders-four-styles", "01-lion-bastion.png", "Lion Bastion", "9ed5ef3667b2fc6c5afa175647acb3b5562cb699b6dc0741fe73be4149af767d"),
  accessoryAsset("shoulders-four-styles", "02-glacier-shard.png", "Glacier Shard", "f4eb6e1e598ff66b8c2b1e76d6f69ed36245ca28e650494b5a30cb684652461e"),
  accessoryAsset("shoulders-four-styles", "03-apex-neon.png", "Apex Neon", "0b8a2cb807477c10e9912877629b58b74215427061b61c29a349d6bf99cba917"),
  accessoryAsset("shoulders-four-styles", "04-copperwork.png", "Copperwork", "e6aed9cbc47d52a43875705d5027326db80ee106ce73e33dbf6e11a32d72dc8d")
] as const;

const wingAssets = [
  accessoryAsset("wings-four-styles", "01-mechanical-feathers.png", "Seraph Mechanica", "20774e942e75468b2ce66962f8b66c882bb3297541ca7eefc288caa2858ab42a"),
  accessoryAsset("wings-four-styles", "02-prism-butterfly.png", "Prism Butterfly", "1f3674969091e77ea6d9c88cdc0394595dba22e5994848c2c26701a1e896ba97"),
  accessoryAsset("wings-four-styles", "03-neon-vector.png", "Neon Vector", "e383ee4b679c0922cc92d4542909af86924dc4cfc82269f7b8495c10b623d384"),
  accessoryAsset("wings-four-styles", "04-clockwork-sail.png", "Clockwork Sail", "56e561616335a1787b349f5e0ebc6e5e564af47778123d34c7072d903011a111")
] as const;

const backDecorAssets = [
  accessoryAsset("back-decor-four-styles", "01-orbit-cargo.png", "Orbit Cargo", "1f110d956ab7e205e74c5f58c1abe52eaa126afb1d959b0e4060469cee0c4e77", 1024, 1536),
  accessoryAsset("back-decor-four-styles", "02-arcane-hearth.png", "Arcane Hearth", "baad07b098c71954ba8764aa7c038a728e4deef1ad99c163bd089d615f3b6d53"),
  accessoryAsset("back-decor-four-styles", "03-vintage-voyager.png", "Vintage Voyager", "00e2f8abfe1d9c5e82b099ee2d760ab88be421c2ff4ee78cc5e3e34bdafb28de"),
  accessoryAsset("back-decor-four-styles", "04-pocket-garden.png", "Pocket Garden", "7839c8dc6ac7440959208e459fabb46737f241baf282002106c0abd540a13dad")
] as const;

const christmasAssets = [
  accessoryAsset("christmas-back-modules", "01-angel.png", "Celestial Noel", "a8be0d55fe51b04f833a586a7a8abcbc909d368f4912549760e813a97769ce32"),
  accessoryAsset("christmas-back-modules", "02-gifts.png", "Gift Express", "f95c1461acc256c1c8899f71d79803dd237d1e1dcb1fb69ccf62280b38e468a1"),
  accessoryAsset("christmas-back-modules", "03-frost.png", "Frost Wings", "d32326b7fdb064dadfb2edfd1e97cd49c7470805f67fd26360a2ba7c68fbddbb"),
  accessoryAsset("christmas-back-modules", "04-gingerbread.png", "Gingerbread Workshop", "d508d393006326994659a1f913ce5105be4b9b2c4acb9d902da4c8531b99ac82")
] as const;

const easterAssets = [
  accessoryAsset("easter-four-styles", "01-eggstronaut.png", "Eggstronaut", "7dca7d50da535e94d56353e68b615ddfa99fb064661a4a529c4d40d3d44719c2"),
  accessoryAsset("easter-four-styles", "02-carrot-turbo.png", "Carrot Turbo", "ef78f89d09db3521adc9a8cc1d5335104a4d692c909e6b4f4ad541942ef97487", 1024, 1536),
  accessoryAsset("easter-four-styles", "03-candy-basket.png", "Candy Basket", "fcb4d97f214554ebe88cfb28774638311c938d07072d00dd40369879ceda6486"),
  accessoryAsset("easter-four-styles", "04-hatchling.png", "Hatchling", "0e56ebc1e61340400b244814d09867956aa80affd51ab910d87ffa9708b94722")
] as const;

const halloweenAssets = [
  accessoryAsset("halloween-four-bold-styles", "01-pumpkin-pop.png", "Pumpkin Pop", "a25d2abfa2eda586888e9498817b8973b6531439b23e6ea20750b15e0d0e8810"),
  accessoryAsset("halloween-four-bold-styles", "02-ghost-castle.png", "Ghost Castle", "db633991cca4166b3587adfbf6858bd5fb631f1d9abd0cb92ddd9670a7e3b638"),
  accessoryAsset("halloween-four-bold-styles", "03-neon-alchemist.png", "Neon Alchemist", "a8e7fda3c7cb7d040d0ba245d301fdda1d114fc967da419005d587a00f9c1f4d"),
  accessoryAsset("halloween-four-bold-styles", "04-mummy-mimic.png", "Mummy Mimic", "cb220d77cca9b3c94cbfc12e77fcb3ed5f3cf9cbc31a2cf8729434d2bf2c10a2")
] as const;

const warcraftAssets = [
  accessoryAsset("warcraft-four-styles", "01-alliance-lion.png", "Alliance Lion", "60f3a2316e9f41e05086e2e1bfe6c4ff9e7270262a408ed160b11079dc7e9dc0"),
  accessoryAsset("warcraft-four-styles", "02-horde-wardrum.png", "Horde Wardrum", "7e942716b39e8831d6c6940aa54fea20a6880d4107bc6beac9a87b0bf452e731"),
  accessoryAsset("warcraft-four-styles", "03-frozen-throne.png", "Frozen Throne", "b6fbf5215f490487b67c8ea6e71bdcc3fb0295b8a9150b1cec1f286c9422f65e"),
  accessoryAsset("warcraft-four-styles", "04-goblin-overdrive.png", "Goblin Overdrive", "35f4096afdb6a0ff78aaccedb2672cdeff7ee49477c4f626413f7c25b43b27ae")
] as const;

function accessoryWork(
  slug: NaviAccessoryWork["slug"],
  title: string,
  accessoryCategory: string,
  description: string,
  imageAlt: string,
  assets: readonly EaisAccessoryAsset[]
): NaviAccessoryWork {
  return {
    slug,
    title,
    category: "quadrupeds",
    summary: description,
    outcome: description,
    image: assets[0].publicPath,
    imageAlt,
    isFeatured: false,
    isPreview: true,
    availability: "unavailable",
    collection: NAVI_ACCESSORY_COLLECTION,
    accessoryCategory,
    description,
    assets
  };
}

export const naviAccessoryWorks = [
  accessoryWork(
    "navi-accessories-helmet-themes",
    "Modular Helmet Themes",
    "Helmet Themes",
    "Four modular helmet directions explore space, samurai, deep-sea, and neon styling for NAVI.",
    "A portrait design board showing the Orbit Explorer modular helmet and its components for a white robot dog",
    helmetAssets
  ),
  accessoryWork(
    "navi-accessories-shoulder-styles",
    "Shoulder Armor Styles",
    "Shoulder Styles",
    "Four sculpted shoulder concepts range from ceremonial armor to icy, neon, and copper finishes.",
    "A portrait design board showing paired Lion Bastion shoulder armor and mounting views on a white robot dog",
    shoulderAssets
  ),
  accessoryWork(
    "navi-accessories-wing-styles",
    "Modular Wing Styles",
    "Wing Styles",
    "Four decorative wing kits compare mechanical feathers, translucent forms, neon fins, and clockwork sails.",
    "A portrait design board showing the Seraph Mechanica modular wing kit and mounting views on a white robot dog",
    wingAssets
  ),
  accessoryWork(
    "navi-accessories-back-decor",
    "Back Decor Modules",
    "Back Decor",
    "Four compact back modules explore cargo, magical, travel, and miniature garden silhouettes for NAVI.",
    "A portrait design board showing the Orbit Cargo modular back kit and mounting views on a white robot dog",
    backDecorAssets
  ),
  accessoryWork(
    "navi-accessories-christmas-modules",
    "Christmas Back Modules",
    "Christmas Accessories",
    "Four festive accessory systems pair seasonal armor with distinct compact back modules and clear mounting views.",
    "A portrait design board showing the Celestial Noel Christmas accessory concept on a white robot dog",
    christmasAssets
  ),
  accessoryWork(
    "navi-accessories-easter-styles",
    "Easter Accessory Styles",
    "Easter Accessories",
    "Four seasonal spring looks combine playful headpieces, armor, badges, and back modules for NAVI.",
    "A portrait design board showing the colorful Eggstronaut Easter accessory concept on a white robot dog",
    easterAssets
  ),
  accessoryWork(
    "navi-accessories-halloween-styles",
    "Halloween Bold Styles",
    "Halloween Accessories",
    "Four high-contrast Halloween concepts explore playful, architectural, neon, and wrapped character themes.",
    "A portrait design board showing the orange and purple Pumpkin Pop Halloween accessory concept on a white robot dog",
    halloweenAssets
  ),
  accessoryWork(
    "navi-accessories-warcraft-styles",
    "Warcraft Armor Styles",
    "Warcraft Styles",
    "Four fantasy armor directions combine bold faction-inspired silhouettes with compact thematic back modules.",
    "A portrait design board showing the blue and gold Alliance Lion fantasy armor concept on a white robot dog",
    warcraftAssets
  )
] as const satisfies readonly NaviAccessoryWork[];
