// app/api/ai-suggest/route.ts
// POST /api/ai-suggest body: { underlay: UnderlayData } -> { suggestions: WallSuggestion[] }
//
// Asystent AI: patrzy na geometrię z podkładu i sugeruje, co prawdopodobnie jest ścianą.
// Kosztorysant akceptuje (jednym klikiem) lub odrzuca każdą sugestię.
//
// W produkcji: wywołanie Anthropic Messages API z kluczem ANTHROPIC_API_KEY w env.
// Tu: prosty heurystyczny detector — szuka długich, równoległych linii (kandydaci na ściany).
//
// Kluczowy podział: AI sugeruje, Vectrig BRE liczy. Dwa światy, żelazna granica.

import { NextResponse } from "next/server";
import type { UnderlayData } from "@/lib/dxf-parser-wrapper";
import type { WallType } from "@/lib/types";

interface WallSuggestion {
  id: string;
  type: WallType;
  points: Array<{ x: number; y: number }>;
  confidence: number;        // 0-1
  reason: string;
}

function lineLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Heurystyka: linia >= 1500mm to potencjalna ściana zewnętrzna,
// 800-1500mm to wewnętrzna, krótsze pomijamy.
function classifyByLength(len: number): WallType | null {
  if (len >= 4000) return "CLT_120_EXT";
  if (len >= 1500) return "CLT_100_INT";
  if (len >= 800)  return "CLT_80_PART";
  return null;
}

export async function POST(req: Request) {
  try {
    const { underlay } = (await req.json()) as { underlay: UnderlayData };
    const suggestions: WallSuggestion[] = [];

    for (const ent of underlay.entities) {
      if (ent.type === "line" && ent.points.length === 2) {
        const len = lineLength(ent.points[0], ent.points[1]);
        const cls = classifyByLength(len);
        if (cls) {
          suggestions.push({
            id: crypto.randomUUID(),
            type: cls,
            points: ent.points,
            confidence: 0.7,
            reason: `Linia ${Math.round(len)}mm na warstwie ${ent.layer}`,
          });
        }
      } else if (ent.type === "polyline" && ent.points.length >= 2) {
        let totalLen = 0;
        for (let i = 1; i < ent.points.length; i++) {
          totalLen += lineLength(ent.points[i - 1], ent.points[i]);
        }
        const cls = classifyByLength(totalLen);
        if (cls) {
          suggestions.push({
            id: crypto.randomUUID(),
            type: cls,
            points: ent.points,
            confidence: 0.85,
            reason: `Polilinia ${Math.round(totalLen)}mm, ${ent.points.length} pkt`,
          });
        }
      }
    }

    // === MIEJSCE NA ANTHROPIC API ===
    // W produkcji można wywołać Claude z renderem PNG podkładu i listą encji,
    // żeby uzyskać dokładniejsze sugestie semantyczne (rozróżnić ścianę nośną
    // od działowej po kontekście, wykryć drzwi, okna). Przykład pseudokodu:
    //
    //   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    //   const response = await anthropic.messages.create({
    //     model: "claude-opus-4-6",
    //     max_tokens: 4096,
    //     messages: [{
    //       role: "user",
    //       content: [
    //         { type: "image", source: { type: "base64", media_type: "image/png", data: pngBase64 } },
    //         { type: "text", text: `To jest rzut budynku CLT. Wskaż ściany nośne (>=120mm),
    //           działowe (<=80mm), otwory okienne i drzwi. Zwróć JSON:
    //           [{type:"CLT_120_EXT"|"CLT_80_PART"|...,points:[{x,y},...],confidence:0-1,reason:string}]` }
    //       ],
    //     }],
    //   });
    //   suggestions = JSON.parse(response.content[0].text);

    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
