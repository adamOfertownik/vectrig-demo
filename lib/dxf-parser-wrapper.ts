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

export interface BoundsRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Warstwy z elewacji / zestawienia (dxf-writer) — wyłączone z prostokąta „rzutu”, żeby podgląd nie był ściśnięty. */
export function layerExcludedFromPlanBounds(layer: string): boolean {
  const L = layer.toLowerCase();
  if (L.includes("_elew_")) return true;
  if (L.startsWith("zestawienie")) return true;
  return false;
}

function expandBoundsWithPoint(
  b: BoundsRect,
  x: number,
  y: number,
): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

function boundsFromEntity(e: UnderlayEntity, into: BoundsRect): void {
  for (const p of e.points) {
    expandBoundsWithPoint(into, p.x, p.y);
  }
  if (e.type === "circle" && e.center && typeof e.radius === "number") {
    const r = e.radius;
    expandBoundsWithPoint(into, e.center.x - r, e.center.y - r);
    expandBoundsWithPoint(into, e.center.x + r, e.center.y + r);
  }
  if (e.type === "arc" && e.center && typeof e.radius === "number") {
    const r = e.radius;
    expandBoundsWithPoint(into, e.center.x - r, e.center.y - r);
    expandBoundsWithPoint(into, e.center.x + r, e.center.y + r);
  }
}

function computePlanBounds(
  entities: UnderlayEntity[],
  fallback: BoundsRect,
): BoundsRect {
  const b: BoundsRect = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const e of entities) {
    if (layerExcludedFromPlanBounds(e.layer)) continue;
    boundsFromEntity(e, b);
  }
  if (!Number.isFinite(b.minX) || b.maxX <= b.minX || b.maxY <= b.minY) {
    return { ...fallback };
  }
  return b;
}

export interface UnderlayData {
  entities: UnderlayEntity[];
  bounds: BoundsRect;
  /** Granica tylko rzutów (bez elewacji i tabeli) — do skalowania podglądu własnego DXF. */
  planBounds: BoundsRect;
  layers: string[];
}

// --- Affine 2D: INSERT (scale → rotate → translate) w układzie DXF XY ---

type Aff2 = {
  xx: number; xy: number; yx: number; yy: number; tx: number; ty: number;
};

function affIdentity(): Aff2 {
  return { xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 };
}

function affMultiply(a: Aff2, b: Aff2): Aff2 {
  return {
    xx: a.xx * b.xx + a.xy * b.yx,
    xy: a.xx * b.xy + a.xy * b.yy,
    yx: a.yx * b.xx + a.yy * b.yx,
    yy: a.yx * b.xy + a.yy * b.yy,
    tx: a.xx * b.tx + a.xy * b.ty + a.tx,
    ty: a.yx * b.tx + a.yy * b.ty + a.ty,
  };
}

function affApply(aff: Aff2, x: number, y: number): Point {
  return {
    x: aff.xx * x + aff.xy * y + aff.tx,
    y: aff.yx * x + aff.yy * y + aff.ty,
  };
}

function affFromInsert(e: Record<string, unknown>): Aff2 {
  const sx = typeof e.xScale === "number" && Number.isFinite(e.xScale) ? e.xScale : 1;
  const sy = typeof e.yScale === "number" && Number.isFinite(e.yScale) ? e.yScale : 1;
  const rotDeg = typeof e.rotation === "number" && Number.isFinite(e.rotation) ? e.rotation : 0;
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const pos = e.position as { x?: number; y?: number } | undefined;
  const tx = pos?.x ?? 0;
  const ty = pos?.y ?? 0;
  return {
    xx: c * sx,
    xy: -s * sy,
    yx: s * sx,
    yy: c * sy,
    tx,
    ty,
  };
}

function affScaleFactor(aff: Aff2): number {
  return (Math.hypot(aff.xx, aff.yx) + Math.hypot(aff.xy, aff.yy)) / 2;
}

function affRotationDelta(aff: Aff2): number {
  return Math.atan2(aff.yx, aff.xx);
}

function transformUnderlay(u: UnderlayEntity, aff: Aff2, layerFallback: string): UnderlayEntity {
  const layer = u.layer || layerFallback;
  const mapPt = (p: Point) => affApply(aff, p.x, p.y);

  if (u.type === "line" || u.type === "polyline") {
    return { ...u, layer, points: u.points.map(mapPt) };
  }
  if (u.type === "circle" && u.center && typeof u.radius === "number") {
    const scale = affScaleFactor(aff);
    return { ...u, layer, center: mapPt(u.center), radius: u.radius * scale };
  }
  if (
    u.type === "arc"
    && u.center
    && typeof u.radius === "number"
    && typeof u.startAngle === "number"
    && typeof u.endAngle === "number"
  ) {
    const scale = affScaleFactor(aff);
    const delta = affRotationDelta(aff);
    return {
      ...u,
      layer,
      center: mapPt(u.center),
      radius: u.radius * scale,
      startAngle: u.startAngle + delta,
      endAngle: u.endAngle + delta,
    };
  }
  return { ...u, layer };
}

/** Konwersja pojedynczej encji DXF (bez INSERT) → UnderlayEntity lub null. */
function rawEntityToUnderlay(e: Record<string, unknown>): UnderlayEntity | null {
  const layer = (e.layer as string) ?? "0";
  const type = (e.type as string)?.toLowerCase() ?? "";

  if (type === "line") {
    const v = e.vertices as Array<{ x: number; y: number }> | undefined;
    if (v && v.length === 2) {
      return {
        type: "line",
        layer,
        points: [
          { x: v[0].x, y: v[0].y },
          { x: v[1].x, y: v[1].y },
        ],
      };
    }
  } else if (type === "lwpolyline" || type === "polyline") {
    const v = e.vertices as Array<{ x: number; y: number }> | undefined;
    if (v && v.length >= 2) {
      const points: Point[] = v
        .filter((p) => typeof p.x === "number" && typeof p.y === "number")
        .map((p) => ({ x: p.x, y: p.y }));
      if (points.length >= 2) {
        return { type: "polyline", layer, points };
      }
    }
  } else if (type === "circle") {
    const c = e.center as { x: number; y: number } | undefined;
    const r = e.radius as number | undefined;
    if (c && typeof r === "number") {
      return {
        type: "circle",
        layer,
        points: [],
        center: { x: c.x, y: c.y },
        radius: r,
      };
    }
  } else if (type === "arc") {
    const c = e.center as { x: number; y: number } | undefined;
    const r = e.radius as number | undefined;
    const sa = e.startAngle as number | undefined;
    const ea = e.endAngle as number | undefined;
    if (c && typeof r === "number" && typeof sa === "number" && typeof ea === "number") {
      return {
        type: "arc",
        layer,
        points: [],
        center: { x: c.x, y: c.y },
        radius: r,
        startAngle: sa,
        endAngle: ea,
      };
    }
  }
  return null;
}

type BlockMap = Record<string, { entities?: Array<Record<string, unknown>> } | undefined> | undefined;

function expandEntitiesWithInserts(
  entities: Array<Record<string, unknown>> | undefined,
  blocks: BlockMap,
  parentAff: Aff2,
  out: UnderlayEntity[],
): void {
  for (const e of entities ?? []) {
    const type = (e.type as string)?.toLowerCase() ?? "";
    if (type === "insert") {
      const name = e.name as string | undefined;
      if (!name || !blocks) continue;
      const block = blocks[name];
      const inner = block?.entities;
      if (!inner?.length) continue;
      const local = affFromInsert(e);
      const combined = affMultiply(parentAff, local);
      expandEntitiesWithInserts(inner, blocks, combined, out);
      continue;
    }
    const u = rawEntityToUnderlay(e);
    if (u) {
      out.push(transformUnderlay(u, parentAff, (e.layer as string) ?? "0"));
    }
  }
}

function looksLikeBinaryDxf(text: string): boolean {
  const head = text.slice(0, 40);
  if (head.includes("AutoCAD Binary DXF")) return true;
  for (let i = 0; i < Math.min(text.length, 200); i++) {
    if (text.charCodeAt(i) === 0) return true;
  }
  return false;
}

function rethrowParseError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("n must be greater than 0")) {
    throw new Error(
      "DXF zawiera uszkodzoną LWPOLYLINE (0 wierzchołków). Otwórz plik w CAD i zapisz ponownie jako ASCII DXF.",
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

export function parseDxfText(dxfText: string): UnderlayData {
  if (!dxfText.trim()) {
    throw new Error("Plik DXF jest pusty");
  }
  if (looksLikeBinaryDxf(dxfText)) {
    throw new Error(
      "Wykryto DXF binarny. Zapisz plik jako ASCII DXF (tekstowy) i spróbuj ponownie.",
    );
  }

  const parser = new DxfParserLib();
  let dxf: {
    entities?: Array<Record<string, unknown>>;
    blocks?: BlockMap;
    tables?: { layer?: { layers?: Record<string, unknown> } };
  };
  try {
    const parsed = parser.parseSync(dxfText);
    if (parsed == null || typeof parsed !== "object") {
      throw new Error("Parser zwrócił pusty wynik — sprawdź, czy plik jest poprawnym DXF ASCII.");
    }
    dxf = parsed as unknown as typeof dxf;
  } catch (e) {
    rethrowParseError(e);
  }

  const emptyBounds = (): BoundsRect => ({
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });

  const out: UnderlayData = {
    entities: [],
    bounds: emptyBounds(),
    planBounds: emptyBounds(),
    layers: [],
  };

  if (dxf.tables?.layer?.layers) {
    out.layers = Object.keys(dxf.tables.layer.layers);
  }

  const flat: UnderlayEntity[] = [];
  expandEntitiesWithInserts(dxf.entities, dxf.blocks, affIdentity(), flat);
  out.entities = flat;

  const updateBounds = (p: Point) => {
    if (p.x < out.bounds.minX) out.bounds.minX = p.x;
    if (p.y < out.bounds.minY) out.bounds.minY = p.y;
    if (p.x > out.bounds.maxX) out.bounds.maxX = p.x;
    if (p.y > out.bounds.maxY) out.bounds.maxY = p.y;
  };

  for (const ent of out.entities) {
    for (const p of ent.points) {
      updateBounds(p);
    }
    if (ent.type === "circle" && ent.center && typeof ent.radius === "number") {
      const r = ent.radius;
      updateBounds({ x: ent.center.x - r, y: ent.center.y - r });
      updateBounds({ x: ent.center.x + r, y: ent.center.y + r });
    }
    if (ent.type === "arc" && ent.center && typeof ent.radius === "number") {
      const r = ent.radius;
      updateBounds({ x: ent.center.x - r, y: ent.center.y - r });
      updateBounds({ x: ent.center.x + r, y: ent.center.y + r });
    }
  }

  if (!Number.isFinite(out.bounds.minX) || out.bounds.maxX <= out.bounds.minX) {
    out.bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 6000 };
  }

  out.planBounds = computePlanBounds(out.entities, out.bounds);

  return out;
}
