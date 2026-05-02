import Replicate from "replicate";
import Anthropic from "@anthropic-ai/sdk";
import { generateEmbedding } from "@/lib/embeddings";
import { searchProducts } from "@/lib/qdrant";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const VALID_STYLES = [
  "modern",
  "minimalist",
  "bohemian",
  "scandinavian",
  "industrial",
  "contemporary",
] as const;

export type Style = (typeof VALID_STYLES)[number];

export const STYLE_DESCRIPTORS: Record<Style, string> = {
  modern:        "modern interior, clean lines, neutral palette, sleek furniture, contemporary design",
  minimalist:    "minimalist interior, simple forms, white and beige tones, uncluttered, calm",
  bohemian:      "bohemian interior, warm earthy tones, layered textures, eclectic decor, indoor plants",
  scandinavian:  "Scandinavian interior, natural wood, cozy hygge atmosphere, light tones, functional",
  industrial:    "industrial interior, raw concrete, exposed metal, dark tones, urban loft aesthetic",
  contemporary:  "contemporary interior, curated styling, elegant proportions, sophisticated palette",
};

export interface MatchedProduct {
  item: string;
  name?: string;
  price?: number;
  category?: string;
  color?: string;
  material?: string;
  imageUrl?: string | null;
  productId?: string | null;
  score?: number;
  shopUrl: string | null;
}

export interface RedesignResult {
  redesignedImage: string;
  style: Style;
  prompt: string | null;
  roomItems: string[];
  matchedProducts: MatchedProduct[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

export async function imageUrlToBase64(
  url: string,
): Promise<{ base64: string; mediaType: string } | null> {
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

async function identifyRoomItems(imageBase64: string, mediaType: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        {
          type: "text",
          text: `Analyze this room. List 4–5 furniture or decor items that are present or would naturally belong here.
Reply with ONLY a JSON array of lowercase singular item names. Example: ["sofa", "rug", "coffee table", "floor lamp"]
No explanation. Just the JSON array.`,
        },
      ],
    }],
  });

  const text = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("").trim();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return ["sofa", "rug", "coffee table", "floor lamp"];
  }
}

async function describeProductImage(
  imageBase64: string,
  mediaType: string,
  itemCategory: string,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 80,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        {
          type: "text",
          text: `Describe this ${itemCategory} in one sentence for an interior design render prompt. Focus on shape, material, color, and finish. No brand names.`,
        },
      ],
    }],
  });

  return response.content.filter(b => b.type === "text").map(b => (b as any).text).join("").trim();
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function performRoomRedesign(
  imageDataUri: string,
  style: Style,
  prompt?: string,
): Promise<RedesignResult> {
  const styleDesc = STYLE_DESCRIPTORS[style];

  // Extract base64 from data URI
  const match = imageDataUri.match(/^data:(image\/[\w+]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Invalid image format. Provide a base64 data URI.");
  const [, rawMediaType, imageBase64] = match;
  const mediaType = rawMediaType.split(";")[0];

  // 1. Identify room items
  let roomItems: string[];
  try {
    roomItems = await identifyRoomItems(imageBase64, mediaType);
  } catch {
    roomItems = ["sofa", "rug", "coffee table", "floor lamp"];
  }

  // 2. Match each item to a DOMA product (parallel)
  const matchResults = await Promise.all(
    roomItems.map(async (item) => {
      try {
        const embedding = await generateEmbedding(`${style} ${item}`);
        const results = await searchProducts(embedding, 1);
        const top = results?.[0];
        if (top?.score && top.score > 0.4) return { item, product: top };
      } catch { /* no match */ }
      return { item, product: null };
    }),
  );

  // 3. Build prompt — use Haiku vision on product images where available
  const productDescriptions: string[] = [];

  await Promise.all(
    matchResults.map(async ({ item, product }) => {
      if (!product) return;
      if (product.imageUrl) {
        const imgData = await imageUrlToBase64(product.imageUrl as string);
        if (imgData) {
          try {
            const desc = await describeProductImage(imgData.base64, imgData.mediaType, item);
            productDescriptions.push(`${item}: ${desc}`);
            return;
          } catch { /* fall through */ }
        }
      }
      const meta = [product.name, product.color, product.material].filter(Boolean).join(", ");
      if (meta) productDescriptions.push(`${item}: ${meta}`);
    }),
  );

  const finalPrompt = [
    styleDesc,
    prompt ? prompt.trim() : "professionally decorated living space",
    ...productDescriptions,
    "photorealistic, 8k, interior photography, beautiful natural lighting, magazine quality",
  ].join(", ");

  // 4. Flux Dev img2img
  const output: any = await replicate.run("black-forest-labs/flux-dev", {
    input: {
      prompt: finalPrompt,
      image: imageDataUri,
      prompt_strength: 0.8,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "jpg",
    },
  });

  let outputImage = Array.isArray(output) ? output[0] : output;

  if (outputImage && typeof outputImage === "object" && "getReader" in outputImage) {
    const blob = await new Response(outputImage).blob();
    outputImage = `data:image/jpeg;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
  }

  // 5. Shape the matched products response
  const matchedProducts: MatchedProduct[] = matchResults
    .filter(r => r.product !== null)
    .map(r => ({
      item: r.item,
      name: r.product!.name,
      price: r.product!.price,
      category: r.product!.category,
      color: r.product!.color,
      material: r.product!.material,
      imageUrl: r.product!.imageUrl as string | null ?? null,
      productId: r.product!.productId as string | null ?? null,
      score: r.product!.score,
      shopUrl: r.product!.productId
        ? `https://doma-backend.onrender.com/api/public-products/${r.product!.productId}`
        : null,
    }));

  return {
    redesignedImage: outputImage,
    style,
    prompt: prompt ?? null,
    roomItems,
    matchedProducts,
  };
}
