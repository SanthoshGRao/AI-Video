import { PrismaClient, ChipCategory } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for seeding");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const propertyTemplates = [
  {
    slug: "farmland",
    name: "Farmland",
    description: "Agricultural land with cultivation potential",
    icon: "TreePine",
    focusAreas: ["plot_size", "water", "soil", "road_access", "legal"],
    aiSystemPrompt:
      "You are a real estate marketing expert specializing in farmland. Focus on soil quality, water sources, road access, legal clarity, and investment yield.",
    scriptStrategy:
      "Open with location advantage, highlight acreage and water, emphasize RTC/legal, close with price and CTA.",
    socialFormat: "Short punchy lines, emoji-light, location-first hooks for Instagram Reels.",
    ctaStyle: "Call now for site visit — limited plots",
    hashtagStrategy: "#farmland #agriculture #investment #karnataka #realestate",
    sampleInput: null,
    sortOrder: 1,
  },
  {
    slug: "plantation",
    name: "Plantation",
    description: "Established or developable plantation property",
    icon: "Palmtree",
    focusAreas: ["tree_count", "yield", "irrigation", "road_access"],
    aiSystemPrompt:
      "Expert in plantation properties. Emphasize tree counts, crop type, drip irrigation, annual yield potential, and maintenance.",
    scriptStrategy:
      "Lead with plantation type and tree count, irrigation systems, income potential, then location and price.",
    socialFormat: "Visual tree-count hooks, yield numbers in captions.",
    ctaStyle: "Schedule plantation walkthrough",
    hashtagStrategy: "#plantation #farm #coconut #arecanut #invest",
    sortOrder: 2,
  },
  {
    slug: "coconut_farm",
    name: "Coconut Farm",
    description: "Coconut plantation with tree inventory",
    icon: "Palmtree",
    focusAreas: ["coconut_trees", "water", "drip_irrigation", "yield"],
    aiSystemPrompt:
      "Specialist in coconut farms. Always mention exact coconut tree count, borewell/water, drip irrigation status, and annual nut yield if known.",
    scriptStrategy:
      "Hook with tree count, water security, irrigation, location distances, price per acre.",
    socialFormat: "Tree-count headline, water + irrigation bullets.",
    ctaStyle: "Book coconut farm visit today",
    hashtagStrategy: "#coconutfarm #coconut #farmland #mysuru #realestate",
    sortOrder: 3,
  },
  {
    slug: "arecanut_farm",
    name: "Arecanut Farm",
    description: "Arecanut plantation property",
    icon: "Citrus",
    focusAreas: ["arecanut_trees", "shade", "irrigation", "yield"],
    aiSystemPrompt:
      "Expert in arecanut farms. Focus on tree count, shade structures, irrigation, and market-linked yield.",
    scriptStrategy: "Tree inventory first, irrigation and shade, location, legal, price.",
    socialFormat: "Yield-focused captions with tree statistics.",
    ctaStyle: "Contact for arecanut farm inspection",
    hashtagStrategy: "#arecanut #plantation #farm #karnataka",
    sortOrder: 4,
  },
  {
    slug: "farmhouse",
    name: "Farmhouse",
    description: "Weekend farmhouse or retreat property",
    icon: "Home",
    focusAreas: ["built_up_area", "amenities", "privacy", "road_access"],
    aiSystemPrompt:
      "Farmhouse lifestyle marketing. Emphasize peace, nature, built-up area, amenities, and weekend getaway appeal.",
    scriptStrategy: "Lifestyle opening, amenities tour, location escape narrative, premium CTA.",
    socialFormat: "Aspirational lifestyle tone, experience-first captions.",
    ctaStyle: "Experience your weekend escape — visit this weekend",
    hashtagStrategy: "#farmhouse #weekendhome #nature #luxury",
    sortOrder: 5,
  },
  {
    slug: "layout_site",
    name: "Layout Site",
    description: "Residential layout plots",
    icon: "MapPin",
    focusAreas: ["plot_dimensions", "approvals", "infrastructure", "location"],
    aiSystemPrompt:
      "Layout site specialist. Highlight BDA/authority approvals, plot dimensions, road width, electricity, water, and appreciation corridor.",
    scriptStrategy: "Approval status first, infrastructure, location connectivity, plot sizes and price.",
    socialFormat: "Approval badges, dimension tables in carousel posts.",
    ctaStyle: "Reserve your plot — phase selling fast",
    hashtagStrategy: "#layout #plots #bda #investment #site",
    sortOrder: 6,
  },
  {
    slug: "villa_plot",
    name: "Villa Plot",
    description: "Premium villa plots in gated communities",
    icon: "Building2",
    focusAreas: ["gated_community", "dimensions", "amenities", "location"],
    aiSystemPrompt:
      "Premium villa plot marketing. Gated community, security, clubhouse amenities, plot dimensions, and elite location.",
    scriptStrategy: "Premium positioning, community amenities, plot specs, investment appreciation.",
    socialFormat: "Luxury tone, amenity icons, exclusivity language.",
    ctaStyle: "Exclusive villa plots — enquire for premium sites",
    hashtagStrategy: "#villaplot #luxury #gatedcommunity #premium",
    sortOrder: 7,
  },
  {
    slug: "commercial_land",
    name: "Commercial Land",
    description: "Commercial or industrial land parcels",
    icon: "Store",
    focusAreas: ["zoning", "frontage", "highway_access", "footfall"],
    aiSystemPrompt:
      "Commercial land expert. Zoning, highway frontage, footfall potential, and business development opportunity.",
    scriptStrategy: "Commercial viability, connectivity, frontage, ROI angle.",
    socialFormat: "Business-investor tone, ROI and connectivity focus.",
    ctaStyle: "Commercial investors — schedule feasibility visit",
    hashtagStrategy: "#commercial #land #business #investment",
    sortOrder: 8,
  },
  {
    slug: "resort_property",
    name: "Resort Property",
    description: "Resort, hospitality, or tourism land",
    icon: "Mountain",
    focusAreas: ["scenery", "water_body", "built_up", "tourism_potential"],
    aiSystemPrompt:
      "Resort and tourism property marketing. Scenic value, water features, existing structures, tourism and hospitality potential.",
    scriptStrategy: "Scenic hook, tourism opportunity, infrastructure, investment or development CTA.",
    socialFormat: "Visual storytelling, destination marketing style.",
    ctaStyle: "Discover your resort investment — private tour available",
    hashtagStrategy: "#resort #tourism #hospitality #property",
    sortOrder: 9,
  },
  {
    slug: "general",
    name: "General Property",
    description: "Flexible template for any property type",
    icon: "Globe",
    focusAreas: ["location", "price", "features", "legal"],
    aiSystemPrompt:
      "General real estate marketing assistant. Extract all facts accurately and present professionally in Kannada-English mix when requested.",
    scriptStrategy: "Standard: location, size, features, legal, price, CTA.",
    socialFormat: "Balanced professional tone across platforms.",
    ctaStyle: "Contact for more details and site visit",
    hashtagStrategy: "#realestate #property #investment #karnataka",
    sortOrder: 10,
  },
];

const promptChips = [
  { label: "More Premium", prompt: "Make the tone more premium and upscale", category: ChipCategory.TONE, icon: "✨", sortOrder: 1 },
  { label: "Investment Focus", prompt: "Emphasize ROI, appreciation, and investment returns", category: ChipCategory.TONE, icon: "📈", sortOrder: 2 },
  { label: "Urgent Sale", prompt: "Add urgency — limited time, act fast messaging", category: ChipCategory.TONE, icon: "🔥", sortOrder: 3 },
  { label: "NRI Investors", prompt: "Target NRI investors with diaspora-friendly language", category: ChipCategory.AUDIENCE, icon: "🌍", sortOrder: 4 },
  { label: "Weekend Farmers", prompt: "Appeal to weekend farmers and hobby agriculturists", category: ChipCategory.AUDIENCE, icon: "🌾", sortOrder: 5 },
  { label: "Shorter Script", prompt: "Reduce length by 30% while keeping key facts", category: ChipCategory.STYLE, icon: "✂️", sortOrder: 6 },
  { label: "More Kannada", prompt: "Increase Kannada proportion in bilingual output", category: ChipCategory.STYLE, icon: "🇮🇳", sortOrder: 7 },
  { label: "Highlight Water", prompt: "Emphasize water sources, borewell, and irrigation", category: ChipCategory.FEATURE, icon: "💧", sortOrder: 8 },
  { label: "Highlight Trees", prompt: "Lead with plantation and tree count details", category: ChipCategory.FEATURE, icon: "🌴", sortOrder: 9 },
  { label: "Stronger CTA", prompt: "End with a stronger call-to-action and contact prompt", category: ChipCategory.FEATURE, icon: "📞", sortOrder: 10 },
];

async function main() {
  console.log("Seeding property templates...");
  for (const tpl of propertyTemplates) {
    await prisma.propertyTemplate.upsert({
      where: { slug: tpl.slug },
      update: tpl,
      create: tpl,
    });
  }

  console.log("Seeding prompt chips...");
  await prisma.promptChip.deleteMany();
  await prisma.promptChip.createMany({ data: promptChips });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
