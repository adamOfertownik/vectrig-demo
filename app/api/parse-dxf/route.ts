// app/api/parse-dxf/route.ts
// POST: multipart/form-data z polem "file" (UI import) albo JSON { dxf: string } → UnderlayData
import { NextResponse } from "next/server";
import { parseDxfText } from "@/lib/dxf-parser-wrapper";

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") ?? "";

    let dxfText: string;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file == null || typeof file === "string") {
        return NextResponse.json(
          { error: "Oczekiwano pliku .dxf w polu „file”" },
          { status: 400 },
        );
      }
      dxfText = await (file as File).text();
    } else {
      const body = (await req.json()) as { dxf?: string };
      if (typeof body.dxf !== "string") {
        return NextResponse.json(
          { error: "Brak pola dxf w JSON lub użyj multipart z polem file" },
          { status: 400 },
        );
      }
      dxfText = body.dxf;
    }

    if (!dxfText.trim()) {
      return NextResponse.json({ error: "Plik DXF jest pusty" }, { status: 400 });
    }

    const data = parseDxfText(dxfText);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg || "Nie udało się sparsować DXF" },
      { status: 500 },
    );
  }
}
