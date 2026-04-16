// app/api/parse-dxf/route.ts
// POST /api/parse-dxf  body: { dxf: string }  -> UnderlayData
import { NextResponse } from "next/server";
import { parseDxfText } from "@/lib/dxf-parser-wrapper";

export async function POST(req: Request) {
  try {
    const { dxf } = (await req.json()) as { dxf: string };
    if (typeof dxf !== "string") {
      return NextResponse.json({ error: "Missing dxf field" }, { status: 400 });
    }
    const data = parseDxfText(dxf);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
