import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { generateText } from "ai";
import { defaultModel } from "@/lib/ai/client";
import { parseJsonFromText } from "@/lib/ai/parse-json";
import { requireProjectAccess, requireScriptInProject } from "@/lib/auth/require-project";
import { handleRouteError } from "@/lib/api/errors";
import { generateSocialBodySchema } from "@/lib/validations/upload";
import { socialContentSchema } from "@/lib/content-pack/schema";
import { trackEvent } from "@/lib/analytics/track";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requireProjectAccess(id);

    const body = generateSocialBodySchema.parse(await request.json());
    const { scriptVersionId, prompt } = body;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { template: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const script = await requireScriptInProject(scriptVersionId, id, user.id);

    const templateSocialFormat = project.template?.socialFormat || "Standard visual property format.";
    const templateHashtagStrategy = project.template?.hashtagStrategy || "#realestate #property";

    const { text } = await generateText({
      model: defaultModel,
      prompt: `You are a world-class real estate social media marketer known for writing highly engaging, viral, and high-converting copy.
Create a high-impact social media content pack for a property based on its video script.

Property Script:
"""
${script.content}
"""

Template Social Format: ${templateSocialFormat}
Template Hashtag Strategy: ${templateHashtagStrategy}
${prompt ? `\nUSER SPECIAL INSTRUCTION for this generation:\n"""\n${prompt}\n"""\nYou MUST follow this instruction carefully when generating the social media content.` : ""}

You MUST respond with a valid JSON object matching this schema perfectly:
{
  "instagramCaptions": ["caption 1", "caption 2", "caption 3"],
  "facebookCopies": ["copy 1", "copy 2"],
  "whatsappCopies": ["copy 1", "copy 2", "copy 3"],
  "youtubeDescriptions": ["desc 1", "desc 2"],
  "telegramCopy": "single Telegram channel post",
  "ctaVariations": ["cta 1", "cta 2", "cta 3", "cta 4", "cta 5"],
  "propertyHighlights": ["highlight 1", "highlight 2", "highlight 3", "highlight 4"],
  "googleBusinessPost": "Google Business profile post text",
  "hashtagSets": {
    "set10": ["#tag", ... (10 tags)],
    "set20": ["#tag", ... (20 tags)],
    "set30": ["#tag", ... (30 tags)]
  },
  "seoMetadata": {
    "title": "string (max 60 chars)",
    "description": "string (max 160 chars)",
    "keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5"]
  }
}

TONE AND STYLE GUIDELINES:
- **EXTREMELY IMPACTFUL:** Use power words (e.g., "Exclusive", "Breathtaking", "Once-in-a-lifetime", "Rare").
- **HIGH CONVERSION:** Every post must end with a strong, urgent Call-To-Action (CTA).
- **EMOJIS:** Liberally use highly visual emojis (🔥, 📍, 💎, 🚀, 🏡) to break up text and draw attention.
- **WHATSAPP:** Make WhatsApp forwards punchy, scannable, using bullet points and bold text (*bold*).
- **INSTAGRAM:** Generate captions that are ready to post. MUST include hooks, line breaks, emojis, and a CTA. DO NOT INCLUDE ANY HASHTAGS AT THE END OF THE CAPTIONS. All hashtags must be kept strictly separated in the \`hashtagSets\` object.
- **HASHTAG SETS:** Generate three variations of hashtag sets (10, 20, and 30 hashtags) tailored to the property in the \`hashtagSets\` object. NO HASHTAGS IN ANY OTHER POSTS.
OUTPUT ONLY RAW JSON. NO MARKDOWN. NO CODE BLOCKS.`,
    });

    const object = parseJsonFromText(text, socialContentSchema);

    await prisma.contentPack.updateMany({
      where: { projectId: project.id, isActive: true },
      data: { isActive: false },
    });

    // Save the ContentPack
    const lastPack = await prisma.contentPack.findFirst({
      where: { projectId: project.id },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ],
      select: { version: true },
    });
    const nextVersion = (lastPack?.version ?? 0) + 1;

    const contentPack = await prisma.contentPack.create({
      data: {
        projectId: project.id,
        version: nextVersion,
        instagramCaptions: object.instagramCaptions,
        facebookCopies: object.facebookCopies,
        whatsappCopies: object.whatsappCopies,
        youtubeDescriptions: object.youtubeDescriptions,
        telegramCopy: object.telegramCopy,
        ctaVariations: object.ctaVariations,
        propertyHighlights: object.propertyHighlights,
        googleBusinessPost: object.googleBusinessPost,
        hashtagSets: object.hashtagSets,
        seoMetadata: object.seoMetadata,
        isActive: true,
      },
    });

    await trackEvent(user.id, "content_pack_generated", {
      projectId: project.id,
      version: nextVersion,
    });

    return NextResponse.json({ contentPack });
  } catch (error) {
    return handleRouteError(error);
  }
}
