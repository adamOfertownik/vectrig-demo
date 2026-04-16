// lib/dxf-parser-wrapper.ts — wrapper na bibliotekę dxf-parser
// Po stronie SERWERA. Klient wgrywa DXF, my parsujemy i zwracamy uproszczoną geometrię
// do narysowania jako półprzezroczysty podkład w konfiguratorze.

import DxfParserLib from "dxf-parser";
import type { Point } from "./types";

export interface UnderlayEntity {
  type: "line" | "polyline" | "arc" | "circle";
  layer: string;
  points: Point[];        // dla line/polyline
  center?: Point;         // dla arc/circle
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

export interface UnderlayData {
  entities: UnderlayEntity[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: string[];
}

export function parseDxfText(dxfText: string): UnderlayData {
  const parser = new DxfParserLib();
  // dxf-parser nie ma dobrych typów — castujemy bezpiecznie
  const dxf = parser.parseSync(dxfText) as unknown as {
    entities?: Array<Record<string, unknown>>;
    tables?: { layer?: { layers?: Record<string, unknown> } };
  };

  const out: UnderlayData = {
    entities: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    layers: [],
  };

  if (dxf.tables?.layer?.layers) {
    out.layers = Object.keys(dxf.tables.layer.layers);
  }

  for (const e of dxf.entities ?? []) {
    const layer = (e.layer as string) ?? "0";
    const type = (e.type as string)?.toLowerCase() ?? "";

    const updateBounds = (p: Point) => {
      if (p.x < out.bounds.minX) out.bounds.minX = p.x;
      if (p.y < out.bounds.minY) out.bounds.minY = p.y;
      if (p.x > out.bounds.maxX) out.bounds.maxX = p.x;
      if (p.y > out.bounds.maxY) out.bounds.maxY = p.y;
    };

    if (type === "line") {
      const v = e.vertices as Array<{ x: number; y: number }> | undefined;
      if (v && v.length === 2) {
        const points: Point[] = [
          { x: v[0].x, y: v[0].y },
          { x: v[1].x, y: v[1].y },
        ];
        points.forEach(updateBounds);
        out.entities.push({ type: "line", layer, points });
      }
    } else if (type === "lwpolyline" || type === "polyline") {
      const v = e.vertices as Array<{ x: number; y: number }> | undefined;
      if (v && v.length >= 2) {
        const points: Point[] = v.map((p) => ({ x: p.x, y: p.y }));
        points.forEach(updateBounds);
        out.entities.push({ type: "polyline", layer, points });
      }
    } else if (type === "circle") {
      const c = e.center as { x: number; y: number } | undefined;
      const r = e.radius as number | undefined;
      if (c && typeof r === "number") {
        updateBounds({ x: c.x - r, y: c.y - r });
        updateBounds({ x: c.x + r, y: c.y + r });
        out.entities.push({ type: "circle", layer, points: [], center: { x: c.x, y: c.y }, radius: r });
      }
    } else if (type === "arc") {
      const c = e.center as { x: number; y: number } | undefined;
      const r = e.radius as number | undefined;
      const sa = e.startAngle as number | undefined;
      const ea = e.endAngle as number | undefined;
      if (c && typeof r === "number" && typeof sa === "number" && typeof ea === "number") {
        updateBounds({ x: c.x - r, y: c.y - r });
        updateBounds({ x: c.x + r, y: c.y + r });
        out.entities.push({
          type: "arc",
          layer,
          points: [],
          center: { x: c.x, y: c.y },
          radius: r,
          startAngle: sa,
          endAngle: ea,
        });
      }
    }
  }

  return out;
}
