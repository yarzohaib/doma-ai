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

async function describeRoomArchitecture(imageBase64: string, mediaType: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    //model: "claude-haiku-4-5-20251001",
    max_tokens: 160,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        {
          type: "text",
          text: `Describe ONLY the fixed architectural surfaces of this room (walls, floor, ceiling, windows, doors, trim). Do NOT mention any furniture, objects, or people — only surfaces that cannot be moved. One sentence, comma-separated. Example: "cream painted walls, beige marble tile floor with dark inset border, plain white flat ceiling with crown molding, large windows with beige curtains".`,
        },
      ],
    }],
  });
  return response.content.filter(b => b.type === "text").map(b => (b as any).text).join("").trim();
}

async function identifyRoomItems(imageBase64: string, mediaType: string, style: string, userPrompt?: string): Promise<string[]> {
  const intentLine = userPrompt
    ? `The user wants to redesign this space as follows: "${userPrompt}". The interior style is ${style}.`
    : `The interior style is ${style}.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    //model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        {
          type: "text",
          text: `${intentLine}
As an interior designer, list exactly 4-5 large standalone furniture pieces needed to furnish this space according to the user's intent and style.
Only include items that sit on the floor: sofa, armchair, desk, office chair, dining table, bed, bookshelf, coffee table, rug, floor lamp, side table, etc.
Reply with ONLY a JSON array of lowercase singular item names.
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
    return ["sofa", "rug", "coffee table", "armchair", "floor lamp"];
  }
}

async function describeProductImage(
  imageBase64: string,
  mediaType: string,
  itemCategory: string,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    //model: "claude-haiku-4-5-20251001",
    max_tokens: 140,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        {
          type: "text",
          text: `Look at this ${itemCategory} and list its key visual properties as short comma-separated descriptive phrases for a text-to-image model. Include: color, material or fabric, shape, and one distinctive detail. Max 12 words total. Example format: "ivory boucle fabric, curved low-profile silhouette, tapered oak legs". No sentences, no brand names, no explanation.`,
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

  const match = imageDataUri.match(/^data:(image\/[\w+]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Invalid image format. Provide a base64 data URI.");
  const [, rawMediaType, imageBase64] = match;
  const mediaType = rawMediaType.split(";")[0];

  // 1. Identify room items + describe architecture in parallel
  let roomItems: string[];
  let roomArchitecture: string;
  [roomItems, roomArchitecture] = await Promise.all([
    identifyRoomItems(imageBase64, mediaType, style, prompt).catch(() => ["sofa", "rug", "coffee table", "armchair", "floor lamp"]),
    describeRoomArchitecture(imageBase64, mediaType).catch(() => ""),
  ]);

  // 2. Match each item to a DOMA product
  // Query combines style + user prompt + item so semantics reflect the full design intent.
  const usedProductIds = new Set<string | number>();

  const matchResults = await Promise.all(
    roomItems.map(async (item) => {
      try {
        const query = [style, prompt?.trim(), item].filter(Boolean).join(" ");
        const embedding = await generateEmbedding(query);
        const results = await searchProducts(embedding, 5);
        const best = results.find(r => r.score && r.score > 0.15 && !usedProductIds.has(r.id));
        if (!best) return { item, product: null };
        usedProductIds.add(best.id);
        return { item, product: best };
      } catch { /* no match */ }
      return { item, product: null };
    }),
  );

  // 3. Build product descriptions using Haiku vision on catalog images
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

  const furniturePlacements = productDescriptions.length > 0
    ? productDescriptions.join("; ")
    : `${style} sofa, area rug, coffee table, floor lamp`;

  const finalPrompt = [
    prompt ? prompt.trim() : "",
    `${styleDesc} interior`,
    furniturePlacements,
    roomArchitecture,
    "photorealistic, 8k, interior photography, beautiful warm natural lighting, magazine quality",
  ].filter(Boolean).join(", ");

  // 4. Flux Dev img2img
  const output: any = await replicate.run("black-forest-labs/flux-dev", {
    input: {
      image: imageDataUri,
      prompt: finalPrompt,
      prompt_strength: 0.75,
      num_inference_steps: 35,
      guidance_scale: 7.5,
      output_format: "jpg",
    },
  });

  let outputImage = Array.isArray(output) ? output[0] : output;

  if (outputImage && typeof outputImage === "object" && "getReader" in outputImage) {
    const blob = await new Response(outputImage).blob();
    outputImage = `data:image/jpeg;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
  }

  // 5. Shape matched products response
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
