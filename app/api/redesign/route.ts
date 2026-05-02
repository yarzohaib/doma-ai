import { NextRequest, NextResponse } from "next/server";
import { performRoomRedesign, VALID_STYLES, Style } from "@/lib/redesign";

export async function POST(req: NextRequest) {
  try {
    const { image, style, prompt } = await req.json();

    if (!image || !style) {
      return NextResponse.json({ error: "image and style are required" }, { status: 400 });
    }

    if (!VALID_STYLES.includes(style)) {
      return NextResponse.json(
        { error: `style must be one of: ${VALID_STYLES.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await performRoomRedesign(image, style as Style, prompt);

    return NextResponse.json({
      output: result.redesignedImage,
      matchedProducts: result.matchedProducts.map(p => ({ item: p.item, product: p })),
      style: result.style,
      roomItems: result.roomItems,
    });
  } catch (error: any) {
    console.error("❌ Redesign error:", error);
    return NextResponse.json({ error: error.message || "Something went wrong" }, { status: 500 });
  }
}
