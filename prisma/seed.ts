import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Sensible defaults from brief section 19. Everything here is editable in brand settings later.
const SPORTSGIRL_SETTINGS = {
  titleCase: "title",
  maxTitleLength: 70,
  attributeOrder: ["colour", "feature", "material", "length", "product_type"],
  requiredCoreTerms: [],
  allowedVocabulary: [],
  prohibitedTerms: [],
  avoidWords: [],
  goodExamples: ["Black Ruched Mesh Midi Dress"],
  poorExamples: [],
  maxSerpQueries: 3,
  serp: { location: "Australia", language: "English", device: "desktop" },
};

async function main() {
  await db.brand.upsert({
    where: { slug: "sportsgirl" },
    update: {},
    create: { name: "Sportsgirl", slug: "sportsgirl", country: "AU", language: "en", settings: SPORTSGIRL_SETTINGS },
  });
  console.log("Seeded brand: sportsgirl. Create logins with `npm run user:create`.");
}

main().finally(() => db.$disconnect());
