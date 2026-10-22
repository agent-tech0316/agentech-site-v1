import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as showcase from "./eais-showcase.ts";

type AccessoryAsset = {
  sourceRelativePath: string;
  publicPath: `/assets/${string}`;
  sha256: string;
  width: number;
  height: number;
};

type AccessoryWork = {
  slug: string;
  title: string;
  category: string;
  collection: string;
  accessoryCategory: string;
  description: string;
  availability: string;
  image: string;
  assets: readonly AccessoryAsset[];
};

type EaisAccessoryExports = {
  naviAccessoryWorks?: readonly AccessoryWork[];
  eaisWorkLibrary?: readonly (AccessoryWork | { slug: string })[];
  canOpenEaisWork?: (work: unknown) => boolean;
};

const feature = showcase as typeof showcase & EaisAccessoryExports;
const workspaceRoot = new URL("../", import.meta.url);

const expectedAssets = [
  ["back-decor-four-styles/01-orbit-cargo.png", "1f110d956ab7e205e74c5f58c1abe52eaa126afb1d959b0e4060469cee0c4e77", 1024, 1536],
  ["back-decor-four-styles/02-arcane-hearth.png", "baad07b098c71954ba8764aa7c038a728e4deef1ad99c163bd089d615f3b6d53", 4096, 6144],
  ["back-decor-four-styles/03-vintage-voyager.png", "00e2f8abfe1d9c5e82b099ee2d760ab88be421c2ff4ee78cc5e3e34bdafb28de", 4096, 6144],
  ["back-decor-four-styles/04-pocket-garden.png", "7839c8dc6ac7440959208e459fabb46737f241baf282002106c0abd540a13dad", 4096, 6144],
  ["christmas-back-modules/01-angel.png", "a8be0d55fe51b04f833a586a7a8abcbc909d368f4912549760e813a97769ce32", 4096, 6144],
  ["christmas-back-modules/02-gifts.png", "f95c1461acc256c1c8899f71d79803dd237d1e1dcb1fb69ccf62280b38e468a1", 4096, 6144],
  ["christmas-back-modules/03-frost.png", "d32326b7fdb064dadfb2edfd1e97cd49c7470805f67fd26360a2ba7c68fbddbb", 4096, 6144],
  ["christmas-back-modules/04-gingerbread.png", "d508d393006326994659a1f913ce5105be4b9b2c4acb9d902da4c8531b99ac82", 4096, 6144],
  ["easter-four-styles/01-eggstronaut.png", "7dca7d50da535e94d56353e68b615ddfa99fb064661a4a529c4d40d3d44719c2", 4096, 6144],
  ["easter-four-styles/02-carrot-turbo.png", "ef78f89d09db3521adc9a8cc1d5335104a4d692c909e6b4f4ad541942ef97487", 1024, 1536],
  ["easter-four-styles/03-candy-basket.png", "fcb4d97f214554ebe88cfb28774638311c938d07072d00dd40369879ceda6486", 4096, 6144],
  ["easter-four-styles/04-hatchling.png", "0e56ebc1e61340400b244814d09867956aa80affd51ab910d87ffa9708b94722", 4096, 6144],
  ["halloween-four-bold-styles/01-pumpkin-pop.png", "a25d2abfa2eda586888e9498817b8973b6531439b23e6ea20750b15e0d0e8810", 4096, 6144],
  ["halloween-four-bold-styles/02-ghost-castle.png", "db633991cca4166b3587adfbf6858bd5fb631f1d9abd0cb92ddd9670a7e3b638", 4096, 6144],
  ["halloween-four-bold-styles/03-neon-alchemist.png", "a8e7fda3c7cb7d040d0ba245d301fdda1d114fc967da419005d587a00f9c1f4d", 4096, 6144],
  ["halloween-four-bold-styles/04-mummy-mimic.png", "cb220d77cca9b3c94cbfc12e77fcb3ed5f3cf9cbc31a2cf8729434d2bf2c10a2", 4096, 6144],
  ["helmet-four-themes/01-orbit-explorer.png", "ec2babcc5380f273d9880acfc1d68a22ce8c6e29a2c39491b19b89b13f811192", 4096, 6144],
  ["helmet-four-themes/02-crimson-kabuto.png", "43a1e978cdfb95ea10abbe6e30c760925ab3a003d9b0b17bf65646ab1952f7c8", 4096, 6144],
  ["helmet-four-themes/03-abyss-diver.png", "696e5d448a0e9b5b6d7dd8dad1728803e758ddca37d1759c745441b695ac0957", 4096, 6144],
  ["helmet-four-themes/04-neon-velocity.png", "679593e1dd80b462613109a39c4457a41212ef3b4da56cfce0281aadca64cd0d", 4096, 6144],
  ["shoulders-four-styles/01-lion-bastion.png", "9ed5ef3667b2fc6c5afa175647acb3b5562cb699b6dc0741fe73be4149af767d", 4096, 6144],
  ["shoulders-four-styles/02-glacier-shard.png", "f4eb6e1e598ff66b8c2b1e76d6f69ed36245ca28e650494b5a30cb684652461e", 4096, 6144],
  ["shoulders-four-styles/03-apex-neon.png", "0b8a2cb807477c10e9912877629b58b74215427061b61c29a349d6bf99cba917", 4096, 6144],
  ["shoulders-four-styles/04-copperwork.png", "e6aed9cbc47d52a43875705d5027326db80ee106ce73e33dbf6e11a32d72dc8d", 4096, 6144],
  ["warcraft-four-styles/01-alliance-lion.png", "60f3a2316e9f41e05086e2e1bfe6c4ff9e7270262a408ed160b11079dc7e9dc0", 4096, 6144],
  ["warcraft-four-styles/02-horde-wardrum.png", "7e942716b39e8831d6c6940aa54fea20a6880d4107bc6beac9a87b0bf452e731", 4096, 6144],
  ["warcraft-four-styles/03-frozen-throne.png", "b6fbf5215f490487b67c8ea6e71bdcc3fb0295b8a9150b1cec1f286c9422f65e", 4096, 6144],
  ["warcraft-four-styles/04-goblin-overdrive.png", "35f4096afdb6a0ff78aaccedb2672cdeff7ee49477c4f626413f7c25b43b27ae", 4096, 6144],
  ["wings-four-styles/01-mechanical-feathers.png", "20774e942e75468b2ce66962f8b66c882bb3297541ca7eefc288caa2858ab42a", 4096, 6144],
  ["wings-four-styles/02-prism-butterfly.png", "1f3674969091e77ea6d9c88cdc0394595dba22e5994848c2c26701a1e896ba97", 4096, 6144],
  ["wings-four-styles/03-neon-vector.png", "e383ee4b679c0922cc92d4542909af86924dc4cfc82269f7b8495c10b623d384", 4096, 6144],
  ["wings-four-styles/04-clockwork-sail.png", "56e561616335a1787b349f5e0ebc6e5e564af47778123d34c7072d903011a111", 4096, 6144]
] as const;

test("NAVI Robot Accessories adds eight individually unavailable cards without replacing the nine existing stories", () => {
  assert.ok(Array.isArray(feature.naviAccessoryWorks), "the accessory collection must be exported as data");
  assert.ok(Array.isArray(feature.eaisWorkLibrary), "the combined work library must be exported as data");
  assert.equal(typeof feature.canOpenEaisWork, "function", "card behavior must derive from record availability");

  const accessories = feature.naviAccessoryWorks;
  assert.equal(accessories.length, 8);
  assert.equal(showcase.prototypeWorks.length, 9);
  assert.equal(feature.eaisWorkLibrary.length, 17);
  assert.deepEqual(showcase.prototypeWorks.filter((work) => ["prototype-sort-at-sight", "prototype-campus-carry", "prototype-drone-chorus"].includes(work.slug)).map((work) => work.title), [
    "Sort at Sight", "Campus Carry", "Drone Chorus"
  ]);

  assert.deepEqual(accessories.map((work) => work.accessoryCategory), [
    "Helmet Themes",
    "Shoulder Styles",
    "Wing Styles",
    "Back Decor",
    "Christmas Accessories",
    "Easter Accessories",
    "Halloween Accessories",
    "Warcraft Styles"
  ]);

  for (const work of accessories) {
    assert.equal(work.collection, "NAVI — Robot Accessories");
    assert.equal(work.category, "quadrupeds");
    assert.equal(work.availability, "unavailable");
    assert.equal(work.assets.length, 4);
    assert.equal(work.image, work.assets[0].publicPath);
    assert.ok(work.title.length > 0);
    assert.ok(work.description.length > 40);
    assert.equal(feature.canOpenEaisWork(work), false);
    assert.equal(showcase.findEaisProject(work.slug), undefined, "unavailable accessory cards must not resolve to a story route");
  }
  assert.equal(feature.canOpenEaisWork(showcase.prototypeWorks[0]), true);
});

test("all 32 accessory PNGs are mapped once and preserve the supplied bytes and dimensions", async () => {
  assert.ok(Array.isArray(feature.naviAccessoryWorks), "the accessory collection must exist before its assets can be verified");
  const assets = feature.naviAccessoryWorks.flatMap((work) => work.assets);
  assert.equal(assets.length, 32);
  assert.equal(new Set(assets.map((asset) => asset.sourceRelativePath)).size, 32);
  assert.equal(new Set(assets.map((asset) => asset.publicPath)).size, 32);

  const actualBySource = new Map(assets.map((asset) => [asset.sourceRelativePath, asset]));
  for (const [sourceRelativePath, sha256, width, height] of expectedAssets) {
    const asset = actualBySource.get(sourceRelativePath);
    assert.ok(asset, `${sourceRelativePath} must be included in metadata`);
    assert.equal(asset.sha256, sha256);
    assert.equal(asset.width, width);
    assert.equal(asset.height, height);

    const bytes = await readFile(new URL(`public${asset.publicPath}`, workspaceRoot));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256, `${sourceRelativePath} must preserve its original bytes`);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${sourceRelativePath} must remain a PNG`);
    assert.equal(bytes.readUInt32BE(16), width, `${sourceRelativePath} width must match metadata`);
    assert.equal(bytes.readUInt32BE(20), height, `${sourceRelativePath} height must match metadata`);
  }
});

test("EAIS search, category filtering, and pagination include every accessory card while stories keep their old interaction", () => {
  assert.ok(Array.isArray(feature.naviAccessoryWorks));
  assert.ok(Array.isArray(feature.eaisWorkLibrary));

  assert.equal(showcase.filterEaisWorks("for-you", "NAVI — Robot Accessories").length, 8);
  assert.deepEqual(showcase.filterEaisWorks("for-you", "Helmet Themes").map((work) => work.slug), ["navi-accessories-helmet-themes"]);
  assert.deepEqual(showcase.filterEaisWorks("for-you", "four seasonal spring looks").map((work) => work.slug), ["navi-accessories-easter-styles"]);
  assert.deepEqual(showcase.filterEaisWorks("for-you", "Warcraft Armor Styles").map((work) => work.slug), ["navi-accessories-warcraft-styles"]);
  assert.equal(showcase.filterEaisWorks("quadrupeds", "").filter((work) => work.slug.startsWith("navi-accessories-")).length, 8);
  assert.equal(showcase.filterEaisWorks("drones", "NAVI — Robot Accessories").length, 0);

  const pages = Array.from({ length: 6 }, (_, index) => showcase.paginateEaisWorks(feature.eaisWorkLibrary!, index + 1, 3));
  const pagedSlugs = pages.flatMap((page) => page.items.map((work) => work.slug));
  assert.equal(pagedSlugs.length, 17);
  assert.equal(new Set(pagedSlugs).size, 17);
  assert.ok(feature.naviAccessoryWorks.every((work) => pagedSlugs.includes(work.slug)));
});
