import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import Anthropic from "@anthropic-ai/sdk";
import { generateEmbedding } from "@/lib/embeddings";
import { searchProducts } from "@/lib/qdrant";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STYLE_DESCRIPTORS: Record<string, string> = {
  modern:        "modern interior, clean lines, neutral palette, sleek furniture, contemporary design",
  minimalist:    "minimalist interior, simple forms, white and beige tones, uncluttered, calm",
  bohemian:      "bohemian interior, warm earthy tones, layered textures, eclectic decor, indoor plants",
  scandinavian:  "Scandinavian interior, natural wood, cozy hygge atmosphere, light tones, functional",
  industrial:    "industrial interior, raw concrete, exposed metal, dark tones, urban loft aesthetic",
  contemporary:  "contemporary interior, curated styling, elegant proportions, sophisticated palette",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mediaType = contentType.startsWith("image/") ? contentType.split(";")[0] : "image/jpeg";
    return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), mediaType };
  } catch {
    return null;
  }
}

// Step 1: Haiku identifies what furniture/decor items are in the room
async function identifyRoomItems(imageBase64: string, mediaType: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType as any, data: imageBase64 },
        },
        {
          type: "text",
          text: `Analyze this room. List 4–5 furniture or decor items that are present or would naturally belong here (e.g. sofa, rug, coffee table, floor lamp, curtains, side table, bookshelf, pendant light, armchair).
Reply with ONLY a JSON array of lowercase singular item names. Example: ["sofa", "rug", "coffee table", "floor lamp"]
No explanation. Just the JSON array.`,
        },
      ],
    }],
  });

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => (b as any).text)
    .join("")
    .trim();

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return ["sofa", "rug", "coffee table", "floor lamp"];
  }
}

// Step 2: Haiku describes a product image in one sentence for use in the redesign prompt
async function describeProduct(imageBase64: string, mediaType: string, itemCategory: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 80,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType as any, data: imageBase64 },
        },
        {
          type: "text",
          text: `Describe this ${itemCategory} in one sentence for an interior design render prompt. Focus on shape, material, color, and finish. No brand names.`,
        },
      ],
    }],
  });

  return response.content
    .filter(b => b.type === "text")
    .map(b => (b as any).text)
    .join("")
    .trim();
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { image, style, prompt } = await req.json();

    if (!image || !style) {
      return NextResponse.json({ error: "image and style are required" }, { status: 400 });
    }

    const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
    console.log(`\n🏠 Room redesign | style: ${style} | prompt: ${prompt ?? "(none)"}`);

    // Extract base64 from data URI
    const match = image.match(/^data:(image\/[\w+]+);base64,(.+)$/s);
    if (!match) return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
    const [, rawMediaType, imageBase64] = match;
    const mediaType = rawMediaType.split(";")[0];

    // ── 1. Identify room items ────────────────────────────────────────────
    let roomItems: string[] = [];
    try {
      console.log("🔍 Analyzing room...");
      roomItems = await identifyRoomItems(imageBase64, mediaType);
      console.log("📋 Items identified:", roomItems);
    } catch (err) {
      console.warn("⚠️  Room analysis failed, using defaults:", err);
      roomItems = ["sofa", "rug", "coffee table", "floor lamp"];
    }

    // ── 2. Match each item to a DOMA product (parallel) ──────────────────
    console.log(`🛍  Searching catalog for ${roomItems.length} items...`);

    const matchResults = await Promise.all(
      roomItems.map(async (item) => {
        try {
          const embedding = await generateEmbedding(`${style} ${item}`);
          const results = await searchProducts(embedding, 1);
          const top = results?.[0];
          if (top?.score && top.score > 0.4) {
            console.log(`  ✅ "${item}" → "${top.name}" (${(top.score * 100).toFixed(0)}%)`);
            return { item, product: top };
          }
          console.log(`  —  "${item}" → no catalog match`);
          return { item, product: null };
        } catch {
          return { item, product: null };
        }
      }),
    );

    const catalogMatches = matchResults.filter(r => r.product !== null);
    console.log(`📦 ${catalogMatches.length}/${roomItems.length} items matched to DOMA products`);

    // ── 3. Build redesign prompt ──────────────────────────────────────────
    const productDescriptions: string[] = [];

    await Promise.all(
      catalogMatches.map(async ({ item, product }) => {
        if (!product) return;

        if (product.imageUrl) {
          const imgData = await fetchImageAsBase64(product.imageUrl as string);
          if (imgData) {
            try {
              const desc = await describeProduct(imgData.base64, imgData.mediaType, item);
              productDescriptions.push(`${item}: ${desc}`);
              return;
            } catch { /* fall through to metadata */ }
          }
        }
        // Fallback: use text metadata
        const meta = [product.name, product.color, product.material].filter(Boolean).join(", ");
        productDescriptions.push(`${item}: ${meta}`);
      }),
    );

    const finalPrompt = [
      styleDesc,
      prompt ? prompt.trim() : "professionally decorated living space",
      ...productDescriptions,
      "photorealistic, 8k, interior photography, beautiful natural lighting, magazine quality",
    ].join(", ");

    console.log("📝 Prompt:", finalPrompt);

    // ── 4. Full room redesign via Flux Dev img2img ────────────────────────
    const output: any = await replicate.run("black-forest-labs/flux-dev", {
      input: {
        prompt: finalPrompt,
        image,
        prompt_strength: 0.8,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        output_format: "jpg",
      },
    });

    let outputUrl = Array.isArray(output) ? output[0] : output;

    if (outputUrl && typeof outputUrl === "object" && "getReader" in outputUrl) {
      const blob = await new Response(outputUrl).blob();
      outputUrl = `data:image/jpeg;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    }

    // ── 5. Return ─────────────────────────────────────────────────────────
    return NextResponse.json({
      output: outputUrl,
      matchedProducts: matchResults,   // [{ item, product | null }]
      style,
      roomItems,
    });

  } catch (error: any) {
    console.error("❌ Redesign error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
