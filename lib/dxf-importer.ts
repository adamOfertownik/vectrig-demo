// lib/dxf-importer.ts — auto-classify DXF entities into wall/opening types
import type { UnderlayData, UnderlayEntity } from "./dxf-parser-wrapper";
import type { Point } from "./types";

export type ImportEntityType =
  | "ext_wall"
  | "int_wall"
  | "window"
  | "door"
  | "slab"
  | "roof"
  | "ignore";

export interface ImportCandidate {
  entity: UnderlayEntity;
  layer: string;
  suggestedType: ImportEntityType;
  confidence: number;
  points: Point[];
  lengthMM: number;
}

const WALL_KEYWORDS = ["wall", "sciana", "ściana", "mur", "wand"];
const EXT_KEYWORDS = ["ext", "zewn", "outer", "aussen"];
const INT_KEYWORDS = ["int", "wewn", "inner", "innen"];
const WINDOW_KEYWORDS = ["window", "okno", "fenster", "glazing"];
const DOOR_KEYWORDS = ["door", "drzwi", "tür", "tur"];
const SLAB_KEYWORDS = ["slab", "strop", "floor", "decke"];
const ROOF_KEYWORDS = ["roof", "dach"];
const IGNORE_KEYWORDS = ["dim", "text", "hatch", "anno", "defpoints"];

function matchesKeywords(layerName: string, keywords: string[]): boolean {
  const lower = layerName.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function segmentLength(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function totalPolylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += segmentLength(points[i], points[i + 1]);
  }
  return len;
}

function polylineArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function classifyByLayer(layer: string): { type: ImportEntityType; confidence: number } {
  if (matchesKeywords(layer, IGNORE_KEYWORDS)) return { type: "ignore", confidence: 0.9 };
  if (matchesKeywords(layer, DOOR_KEYWORDS)) return { type: "door", confidence: 0.8 };
  if (matchesKeywords(layer, WINDOW_KEYWORDS)) return { type: "window", confidence: 0.8 };
  if (matchesKeywords(layer, ROOF_KEYWORDS)) return { type: "roof", confidence: 0.7 };
  if (matchesKeywords(layer, SLAB_KEYWORDS)) return { type: "slab", confidence: 0.7 };

  if (matchesKeywords(layer, WALL_KEYWORDS)) {
    if (matchesKeywords(layer, EXT_KEYWORDS)) return { type: "ext_wall", confidence: 0.85 };
    if (matchesKeywords(layer, INT_KEYWORDS)) return { type: "int_wall", confidence: 0.85 };
    return { type: "ext_wall", confidence: 0.6 };
  }

  return { type: "ignore", confidence: 0.3 };
}

function classifyByGeometry(entity: UnderlayEntity, scaleFactor: number): { type: ImportEntityType; confidence: number } {
  if (entity.type === "circle" || entity.type === "arc") {
    return { type: "ignore", confidence: 0.5 };
  }

  const pts = entity.points.map((p) => ({
    x: p.x * scaleFactor,
    y: p.y * scaleFactor,
  }));

  if (pts.length < 2) return { type: "ignore", confidence: 0.9 };

  const len = totalPolylineLength(pts);

  if (pts.length >= 4) {
    const area = polylineArea(pts);
    const isClosed = segmentLength(pts[0], pts[pts.length - 1]) < len * 0.05;
    if (isClosed && area > 1_000_000) {
      return { type: "ext_wall", confidence: 0.6 };
    }
  }

  if (len < 500) return { type: "ignore", confidence: 0.5 };
  if (len < 1500) return { type: "window", confidence: 0.4 };
  if (len >= 1500) return { type: "ext_wall", confidence: 0.4 };

  return { type: "ignore", confidence: 0.3 };
}

export function analyzeForImport(
  data: UnderlayData,
  scaleFactor: number = 1,
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];

  for (const entity of data.entities) {
    const layerClass = classifyByLayer(entity.layer);
    const geoClass = classifyByGeometry(entity, scaleFactor);

    const best = layerClass.confidence >= geoClass.confidence ? layerClass : geoClass;

    const pts = entity.points.map((p) => ({
      x: Math.round(p.x * scaleFactor),
      y: Math.round(p.y * scaleFactor),
    }));

    const len = entity.type === "line" || entity.type === "polyline"
      ? totalPolylineLength(pts)
      : entity.radius ? Math.PI * 2 * entity.radius * scaleFactor : 0;

    candidates.push({
      entity,
      layer: entity.layer,
      suggestedType: best.type,
      confidence: best.confidence,
      points: pts,
      lengthMM: Math.round(len),
    });
  }

  return candidates;
}

export function candidatesToWalls(
  candidates: ImportCandidate[],
  wallHeight: number,
  extWallType: string,
  intWallType: string,
) {
  const walls: Array<{
    type: string;
    category: "external" | "internal";
    label: string;
    start: Point;
    end: Point;
    height: number;
    openings: never[];
  }> = [];

  let extIdx = 0;
  let intIdx = 0;

  for (const c of candidates) {
    if (c.suggestedType !== "ext_wall" && c.suggestedType !== "int_wall") continue;
    const isExt = c.suggestedType === "ext_wall";
    const pts = c.points;

    if (pts.length === 2) {
      const idx = isExt ? ++extIdx : ++intIdx;
      walls.push({
        type: isExt ? extWallType : intWallType,
        category: isExt ? "external" : "internal",
        label: isExt ? `Ściana DXF ${idx}` : `Wnętrze DXF ${idx}`,
        start: pts[0],
        end: pts[1],
        height: wallHeight,
        openings: [],
      });
    } else if (pts.length > 2) {
      for (let i = 0; i < pts.length - 1; i++) {
        const idx = isExt ? ++extIdx : ++intIdx;
        walls.push({
          type: isExt ? extWallType : intWallType,
          category: isExt ? "external" : "internal",
          label: isExt ? `Ściana DXF ${idx}` : `Wnętrze DXF ${idx}`,
          start: pts[i],
          end: pts[i + 1],
          height: wallHeight,
          openings: [],
        });
      }
    }
  }

  return walls;
}

export function guessScale(data: UnderlayData): number {
  const w = data.bounds.maxX - data.bounds.minX;
  const h = data.bounds.maxY - data.bounds.minY;
  const maxDim = Math.max(w, h);

  if (maxDim < 1) return 1000;
  if (maxDim < 100) return 1000;
  if (maxDim < 1000) return 100;
  if (maxDim < 100000) return 1;
  return 0.1;
}

export function getLayerSummary(candidates: ImportCandidate[]): Map<string, {
  count: number;
  suggestedType: ImportEntityType;
}> {
  const layerMap = new Map<string, { count: number; types: Map<ImportEntityType, number> }>();

  for (const c of candidates) {
    if (!layerMap.has(c.layer)) {
      layerMap.set(c.layer, { count: 0, types: new Map() });
    }
    const entry = layerMap.get(c.layer)!;
    entry.count++;
    entry.types.set(c.suggestedType, (entry.types.get(c.suggestedType) ?? 0) + 1);
  }

  const result = new Map<string, { count: number; suggestedType: ImportEntityType }>();
  for (const [layer, data] of layerMap) {
    let bestType: ImportEntityType = "ignore";
    let bestCount = 0;
    for (const [type, count] of data.types) {
      if (count > bestCount) { bestCount = count; bestType = type; }
    }
    result.set(layer, { count: data.count, suggestedType: bestType });
  }

  return result;
}
