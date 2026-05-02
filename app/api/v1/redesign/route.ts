import { NextRequest, NextResponse } from "next/server";
import { performRoomRedesign, VALID_STYLES, Style, imageUrlToBase64 } from "@/lib/redesign";

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Auth helper ───────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const apiKey = process.env.DOMA_API_KEY;
  if (!apiKey) return true; // if no key configured, open access (dev mode)

  const fromHeader =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return fromHeader === apiKey;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/redesign
 *
 * Headers:
 *   x-api-key: <your DOMA_API_KEY>
 *   Content-Type: application/json
 *
 * Body:
 * {
 *   "image":  string   — base64 data URI  OR  https:// image URL
 *   "style":  "modern" | "minimalist" | "bohemian" | "scandinavian" | "industrial" | "contemporary"
 *   "prompt": string   — optional extra instructions (e.g. "add a fireplace")
 * }
 *
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "redesignedImage": string      — base64 data URI of the redesigned room
 *     "style": string
 *     "prompt": string | null
 *     "roomItems": string[]          — furniture categories detected in the room
 *     "matchedProducts": [
 *       {
 *         "item": string             — furniture category (e.g. "sofa")
 *         "name": string
 *         "price": number
 *         "imageUrl": string | null
 *         "productId": string | null
 *         "score": number            — catalog match confidence (0–1)
 *         "shopUrl": string | null   — direct link to product in DOMA catalog
 *       }
 *     ]
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized — provide a valid x-api-key header" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  try {
    let { image, style, prompt } = await req.json();

    // Validate required fields
    if (!image) {
      return NextResponse.json(
        { success: false, error: "image is required (base64 data URI or https:// URL)" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (!style) {
      return NextResponse.json(
        { success: false, error: "style is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (!VALID_STYLES.includes(style)) {
      return NextResponse.json(
        { success: false, error: `style must be one of: ${VALID_STYLES.join(", ")}` },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Accept HTTPS image URLs — convert to base64 data URI
    if (typeof image === "string" && image.startsWith("http")) {
      const fetched = await imageUrlToBase64(image);
      if (!fetched) {
        return NextResponse.json(
          { success: false, error: "Could not fetch the image from the provided URL" },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      image = `data:${fetched.mediaType};base64,${fetched.base64}`;
    }

    const result = await performRoomRedesign(image, style as Style, prompt);

    return NextResponse.json(
      { success: true, data: result },
      { headers: CORS_HEADERS },
    );
  } catch (error: any) {
    console.error("❌ /api/v1/redesign error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Something went wrong" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
