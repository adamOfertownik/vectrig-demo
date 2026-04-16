// lib/geometry.ts — vertex-based geometry calculations
import type { Point, Wall, Roof } from "./types";

// ---------------------------------------------------------------------------
// Computed wall properties (from absolute start/end)
// ---------------------------------------------------------------------------

export function wallLength(w: Wall): number {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function wallAngleDeg(w: Wall): number {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

// ---------------------------------------------------------------------------
// WallPosition (kept for API compatibility with rendering)
// ---------------------------------------------------------------------------

export interface WallPosition {
  start: Point;
  end: Point;
  wall: Wall;
  midpoint: Point;
  normal: Point;
}

export function computeFloorPlanPositions(walls: Wall[]): WallPosition[] {
  return walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      start: { ...wall.start },
      end: { ...wall.end },
      wall,
      midpoint: {
        x: (wall.start.x + wall.end.x) / 2,
        y: (wall.start.y + wall.end.y) / 2,
      },
      normal: { x: -dy / len, y: dx / len },
    };
  });
}

// ---------------------------------------------------------------------------
// Closing wall computation
// ---------------------------------------------------------------------------

export function computeClosingWall(
  walls: Wall[]
): { start: Point; end: Point } | null {
  const ext = walls.filter((w) => w.category === "external");
  if (ext.length < 2) return null;

  const first = ext[0].start;
  const last = ext[ext.length - 1].end;
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 10) return null;

  return { start: { ...last }, end: { ...first } };
}

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

export function hitTestWall(
  positions: WallPosition[],
  px: number,
  py: number,
  threshold: number = 300
): number {
  let bestDist = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < positions.length; i++) {
    const { start, end } = positions[i];
    const dist = pointToSegmentDist(px, py, start.x, start.y, end.x, end.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestDist <= threshold ? bestIdx : -1;
}

export interface VertexHit {
  wallIndex: number;
  which: "start" | "end";
  point: Point;
}

export function hitTestVertex(
  walls: Wall[],
  px: number,
  py: number,
  thresholdMM: number
): VertexHit | null {
  let best: VertexHit | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    for (const which of ["start", "end"] as const) {
      const pt = w[which];
      const d = Math.sqrt((pt.x - px) ** 2 + (pt.y - py) ** 2);
      if (d < thresholdMM && d < bestDist) {
        bestDist = d;
        best = { wallIndex: i, which, point: pt };
      }
    }
  }

  return best;
}

/** Midpoint of segment — for edge-resize handles (plan mm). */
export function wallMidpoint(w: Wall): Point {
  return {
    x: (w.start.x + w.end.x) / 2,
    y: (w.start.y + w.end.y) / 2,
  };
}

/** Unit direction start → end. */
export function wallUnitAlong(w: Wall): Point {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function hitTestWallMidpoint(
  walls: Wall[],
  px: number,
  py: number,
  thresholdMM: number
): { wallIndex: number; midpoint: Point } | null {
  let best: { wallIndex: number; midpoint: Point } | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const mx = (w.start.x + w.end.x) / 2;
    const my = (w.start.y + w.end.y) / 2;
    const d = Math.hypot(px - mx, py - my);
    if (d < thresholdMM && d < bestDist) {
      bestDist = d;
      best = { wallIndex: i, midpoint: { x: mx, y: my } };
    }
  }

  return best;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy);

  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

/** Rzut punktu na odcinek — zwraca najbliższy punkt i parametr t∈[0,1]. */
export function projectPointOntoSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { point: { ...a }, t: 0 };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { point: { x: a.x + t * abx, y: a.y + t * aby }, t };
}

/** Dzieli ścianę w punkcie `at` na dwie. Zwraca null, gdy punkt leży zbyt blisko końca. */
export function splitWallAt(
  wall: Wall,
  at: Point,
  minSegmentMM: number = 150,
): [Omit<Wall, "id">, Omit<Wall, "id">] | null {
  const dStart = Math.hypot(at.x - wall.start.x, at.y - wall.start.y);
  const dEnd = Math.hypot(at.x - wall.end.x, at.y - wall.end.y);
  if (dStart < minSegmentMM || dEnd < minSegmentMM) return null;
  const len = wallLength(wall);
  if (len <= 0) return null;
  const t = dStart / len;

  const a: Omit<Wall, "id"> = {
    type: wall.type,
    category: wall.category,
    label: `${wall.label} · A`,
    height: wall.height,
    start: { ...wall.start },
    end: { x: at.x, y: at.y },
    openings: wall.openings
      .filter((op) => op.position < dStart)
      .map((op) => ({ ...op, id: op.id })),
  };
  const b: Omit<Wall, "id"> = {
    type: wall.type,
    category: wall.category,
    label: `${wall.label} · B`,
    height: wall.height,
    start: { x: at.x, y: at.y },
    end: { ...wall.end },
    openings: wall.openings
      .filter((op) => op.position >= dStart)
      .map((op) => ({ ...op, id: op.id, position: op.position - dStart })),
  };
  void t;
  return [a, b];
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export function computeBounds(positions: WallPosition[]): {
  minX: number; minY: number; maxX: number; maxY: number;
  width: number; height: number; centerX: number; centerY: number;
} {
  if (positions.length === 0) {
    return { minX: 0, minY: 0, maxX: 10000, maxY: 6000, width: 10000, height: 6000, centerX: 5000, centerY: 3000 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const wp of positions) {
    minX = Math.min(minX, wp.start.x, wp.end.x);
    minY = Math.min(minY, wp.start.y, wp.end.y);
    maxX = Math.max(maxX, wp.start.x, wp.end.x);
    maxY = Math.max(maxY, wp.start.y, wp.end.y);
  }

  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function computeBoundsFromWalls(walls: Wall[]) {
  return computeBounds(computeFloorPlanPositions(walls));
}

// ---------------------------------------------------------------------------
// Vertex manipulation helpers
// ---------------------------------------------------------------------------

const VERTEX_MATCH_THRESHOLD = 5; // mm

export function moveSharedVertex(
  walls: Wall[],
  targetPoint: Point,
  newPoint: Point,
): Wall[] {
  return walls.map((w) => {
    const sd = Math.sqrt((w.start.x - targetPoint.x) ** 2 + (w.start.y - targetPoint.y) ** 2);
    const ed = Math.sqrt((w.end.x - targetPoint.x) ** 2 + (w.end.y - targetPoint.y) ** 2);
    const startMatch = sd < VERTEX_MATCH_THRESHOLD;
    const endMatch = ed < VERTEX_MATCH_THRESHOLD;
    if (!startMatch && !endMatch) return w;
    return {
      ...w,
      start: startMatch ? { ...newPoint } : w.start,
      end: endMatch ? { ...newPoint } : w.end,
    };
  });
}

export function moveWallParallel(
  wall: Wall,
  offset: number,
): Wall {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  return {
    ...wall,
    start: { x: wall.start.x + nx, y: wall.start.y + ny },
    end: { x: wall.end.x + nx, y: wall.end.y + ny },
  };
}

// ---------------------------------------------------------------------------
// Shoelace formula for polygon area (mm²)
// ---------------------------------------------------------------------------

export function shoelaceArea(walls: Wall[]): number {
  const ext = walls.filter((w) => w.category === "external");
  if (ext.length < 3) return 0;

  const pts: Point[] = ext.map((w) => w.start);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

export function shoelaceAreaSqm(walls: Wall[]): number {
  return shoelaceArea(walls) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Ordered footprint polygon (external walls) — for slab / 3D
// ---------------------------------------------------------------------------

const CHAIN_EPS = 80; // mm — snap wall endpoints when chaining

function pointsEq(a: Point, b: Point): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < CHAIN_EPS;
}

function tryChainPolygon(ext: Wall[], startWallIdx: number, forward: boolean): Point[] | null {
  const n = ext.length;
  const unused = new Set<number>(Array.from({ length: n }, (_, i) => i));
  const w0 = ext[startWallIdx];
  const verts: Point[] = forward
    ? [{ ...w0.start }, { ...w0.end }]
    : [{ ...w0.end }, { ...w0.start }];
  let current = forward ? { ...w0.end } : { ...w0.start };
  unused.delete(startWallIdx);

  while (unused.size > 0) {
    let found = -1;
    for (const i of unused) {
      const w = ext[i];
      if (pointsEq(w.start, current)) {
        current = { ...w.end };
        verts.push(current);
        found = i;
        break;
      }
      if (pointsEq(w.end, current)) {
        current = { ...w.start };
        verts.push(current);
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    unused.delete(found);
  }

  if (verts.length > 1 && pointsEq(verts[0], verts[verts.length - 1])) {
    verts.pop();
  } else if (!pointsEq(verts[0], verts[verts.length - 1])) {
    return null;
  }
  return verts.length >= 3 ? verts : null;
}

/**
 * Orders external wall segments into a closed polygon vertex list (no duplicate closing point).
 * Returns null if walls do not form a single loop.
 */
export function orderExternalPolygonVertices(walls: Wall[]): Point[] | null {
  const ext = walls.filter((w) => w.category === "external");
  if (ext.length < 3) return null;

  for (let i = 0; i < ext.length; i++) {
    const a = tryChainPolygon(ext, i, true);
    if (a) return a;
    const b = tryChainPolygon(ext, i, false);
    if (b) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strop hybrydowy — rozwiązywanie wielokąta
// ---------------------------------------------------------------------------

import type { Floor, SlabShape, Stair } from "./types";

export function resolveSlabPolygon(floor: Floor): Point[] | null {
  const shape: SlabShape | undefined = floor.slabShape;
  if (shape && shape.mode === "detached" && shape.vertices && shape.vertices.length >= 3) {
    return shape.vertices.map((v) => ({ ...v }));
  }
  return orderExternalPolygonVertices(floor.walls);
}

export function polygonAreaSqm(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2 / 1_000_000;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Schody
// ---------------------------------------------------------------------------

function rotatePoint(p: Point, origin: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = p.x - origin.x, dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/** Footprint schodów w planie (wielokąt w mm, absolutny). */
export function stairFootprint(stair: Stair): Point[] {
  const w = stair.width;
  const td = stair.treadDepth;
  const lenA = stair.stepCount * td;
  const pts: Point[] = [];

  if (stair.type === "straight") {
    pts.push(
      { x: 0, y: 0 },
      { x: lenA, y: 0 },
      { x: lenA, y: w },
      { x: 0, y: w },
    );
  } else if (stair.type === "L") {
    const ld = stair.landingDepth ?? w;
    const lenB = (stair.flightBSteps ?? 0) * td;
    // Bieg A (pozioma) + spocznik (ld × ld) + bieg B (pionowa, rotated -90°)
    pts.push(
      { x: 0, y: 0 },
      { x: lenA + ld, y: 0 },
      { x: lenA + ld, y: w },
      { x: lenA, y: w },
      { x: lenA, y: w + lenB },
      { x: lenA + ld, y: w + lenB }, // zgrubne — rysujemy prostokąt spocznika + biegu B
    );
    // Uproszczenie: zwracamy bounding box "L" — praktyczny cutout prostokątny
    const minX = 0, maxX = lenA + ld;
    const minY = 0, maxY = w + lenB;
    return [
      rotatePoint({ x: minX, y: minY }, { x: 0, y: 0 }, stair.rotation),
      rotatePoint({ x: maxX, y: minY }, { x: 0, y: 0 }, stair.rotation),
      rotatePoint({ x: maxX, y: maxY }, { x: 0, y: 0 }, stair.rotation),
      rotatePoint({ x: minX, y: maxY }, { x: 0, y: 0 }, stair.rotation),
    ].map((p) => ({ x: p.x + stair.origin.x, y: p.y + stair.origin.y }));
  } else if (stair.type === "U") {
    const ld = stair.landingDepth ?? w;
    const lenB = (stair.flightBSteps ?? stair.stepCount) * td;
    const maxLen = Math.max(lenA, lenB);
    const minX = 0, maxX = maxLen;
    const minY = 0, maxY = 2 * w + ld;
    return [
      rotatePoint({ x: minX, y: minY }, { x: 0, y: 0 }, stair.rotation),
      rotatePoint({ x: maxX, y: minY }, { x: 0, y: 0 }, stair.rotation),
      rotatePoint({ x: maxX, y: maxY }, { x: 0, y: 0 }, stair.rotation),
      rotatePoint({ x: minX, y: maxY }, { x: 0, y: 0 }, stair.rotation),
    ].map((p) => ({ x: p.x + stair.origin.x, y: p.y + stair.origin.y }));
  }

  return pts.map((p) =>
    rotatePoint(p, { x: 0, y: 0 }, stair.rotation),
  ).map((p) => ({ x: p.x + stair.origin.x, y: p.y + stair.origin.y }));
}

export interface StairStepBox {
  pos: Point;    // lewy-dolny róg w planie (mm)
  size: Point;   // szer (x) × gł (y) w mm
  y: number;     // wysokość dolnej krawędzi (mm)
  h: number;     // wysokość stopnia w mm
  rotation: number;
}

/** Lista boxów stopni dla renderu 3D. */
export function stairStepBoxes(stair: Stair, totalRiseMM: number): StairStepBox[] {
  const steps: StairStepBox[] = [];
  const riserHeight = totalRiseMM / stair.stepCount;
  const td = stair.treadDepth;
  // Bieg A — wzdłuż osi X w lokalnych współrzędnych
  for (let i = 0; i < stair.stepCount; i++) {
    const localPos = { x: i * td, y: 0 };
    const rot = rotatePoint(localPos, { x: 0, y: 0 }, stair.rotation);
    steps.push({
      pos: { x: rot.x + stair.origin.x, y: rot.y + stair.origin.y },
      size: { x: td, y: stair.width },
      y: i * riserHeight,
      h: riserHeight,
      rotation: stair.rotation,
    });
  }
  // Bieg B — uproszczenie dla L/U
  if (stair.type !== "straight" && stair.flightBSteps) {
    const lenA = stair.stepCount * td;
    const ld = stair.landingDepth ?? stair.width;
    for (let i = 0; i < stair.flightBSteps; i++) {
      const localPos = { x: lenA - i * td - td, y: stair.width + ld };
      const rot = rotatePoint(localPos, { x: 0, y: 0 }, stair.rotation);
      steps.push({
        pos: { x: rot.x + stair.origin.x, y: rot.y + stair.origin.y },
        size: { x: td, y: stair.width },
        y: (stair.stepCount + i) * riserHeight,
        h: riserHeight,
        rotation: stair.rotation,
      });
    }
  }
  return steps;
}

export function hitTestStair(stairs: Stair[], p: Point): Stair | null {
  for (const s of stairs) {
    const poly = stairFootprint(s);
    if (pointInPolygon(p, poly)) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dach → wpływ na kształt ściany górnego piętra
// ---------------------------------------------------------------------------

export interface RoofBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

/**
 * Dodatkowa wysokość dachu nad linią eaves w punkcie (x,y).
 * Zgodnie z 3D: kalenica wzdłuż osi X (worldX = planX), slope w osi Y (worldZ = planY).
 */
export function roofExtraAt(p: Point, roof: Roof, b: RoofBounds): number {
  const pitchRad = (roof.pitch * Math.PI) / 180;
  const tanP = Math.tan(pitchRad);
  const depth = b.maxY - b.minY;
  const centerY = (b.minY + b.maxY) / 2;
  switch (roof.type) {
    case "flat":
      return 0;
    case "mono_pitch":
      return Math.max(0, tanP * (p.y - b.minY));
    case "gable":
      return Math.max(0, tanP * (depth / 2 - Math.abs(p.y - centerY)));
    case "hip": {
      const width = b.maxX - b.minX;
      const fromMinX = tanP * (p.x - b.minX);
      const fromMaxX = tanP * (b.maxX - p.x);
      const fromMinY = tanP * (p.y - b.minY);
      const fromMaxY = tanP * (b.maxY - p.y);
      const cap = tanP * Math.min(width, depth) / 2;
      return Math.max(0, Math.min(fromMinX, fromMaxX, fromMinY, fromMaxY, cap));
    }
  }
}

/** Punkty na profilu GÓRY ściany w lokalnych współrzędnych (x∈[0,L], extra≥0). */
export interface WallProfilePoint { x: number; extra: number; }

/**
 * Profil górnej krawędzi ściany (górnego piętra), ponad wysokością bazową wall.height.
 * Zwraca listę punktów od lewej do prawej wzdłuż ściany z dodatkową wysokością `extra`.
 * Dla gable: wstawia dodatkowy wierzchołek w miejscu przecięcia kalenicy.
 * Dla mono_pitch/flat: tylko 2 punkty (początek i koniec).
 */
export function wallRoofProfile(wall: Wall, roof: Roof | null, b: RoofBounds): WallProfilePoint[] {
  const L = wallLength(wall);
  if (!roof || roof.type === "flat") {
    return [{ x: 0, extra: 0 }, { x: L, extra: 0 }];
  }
  const s = wall.start, e = wall.end;
  const extraStart = roofExtraAt(s, roof, b);
  const extraEnd = roofExtraAt(e, roof, b);
  const pts: WallProfilePoint[] = [{ x: 0, extra: extraStart }];

  if (roof.type === "gable") {
    // Kalenica na y = centerY. Jeśli ściana ją przecina, wstaw peak.
    const centerY = (b.minY + b.maxY) / 2;
    if ((s.y - centerY) * (e.y - centerY) < 0) {
      const t = (centerY - s.y) / (e.y - s.y);
      if (t > 0.001 && t < 0.999) {
        const peak = {
          x: L * t,
          extra: roofExtraAt({ x: s.x + t * (e.x - s.x), y: centerY }, roof, b),
        };
        pts.push(peak);
      }
    }
  } else if (roof.type === "hip") {
    // Dodaj punkty w miejscach przełamań (minX,maxX,centerY) — uproszczone, skip peak detection tutaj.
  }

  pts.push({ x: L, extra: extraEnd });
  return pts;
}

/** Maksymalna efektywna wysokość ściany = wall.height + max(extra na profilu). */
export function wallEffectiveHeight(wall: Wall, roof: Roof | null, b: RoofBounds): number {
  if (!roof || roof.type === "flat") return wall.height;
  const profile = wallRoofProfile(wall, roof, b);
  let maxExtra = 0;
  for (const p of profile) maxExtra = Math.max(maxExtra, p.extra);
  return wall.height + maxExtra;
}
