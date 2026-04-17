// lib/dxf-writer.ts — produkcyjny generator DXF z hierarchicznej konfiguracji CLT
// Format DXF ASCII (R12 / AC1009). Polilinie jako POLYLINE+VERTEX (R12), nie LWPOLYLINE (R13+).
// Sekcja BLOCKS jest wymagana — bez niej AutoCAD może otworzyć pusty rysunek.
// Widoki: rzut piętra (plan), rozwinięcie ścian (elewacja), strop, dach.

import type { Project, Floor, Roof, Building } from "./types";
import { allFloorsInProject } from "./project-migrate";
import { findComponent, getWallEntry } from "./catalog";
import {
  computeFloorPlanPositions,
  computeBounds,
  computeBoundsFromWalls,
  resolveSlabPolygon,
  stairFootprint,
  wallLength,
} from "./geometry";
import { resolveOpeningMm } from "./openings";
import { splitProjectPanels } from "./panel-split";

// ---------------------------------------------------------------------------
// DXF primitives
// ---------------------------------------------------------------------------

type Pair = [number, string | number];

function p(code: number, value: string | number): Pair {
  return [code, value];
}

function emit(pairs: Pair[]): string {
  return pairs.map(([c, v]) => `${c}\n${v}`).join("\n");
}

// DXF color indices
const COL = {
  EXT_WALL: 7,       // white/black
  INT_WALL: 8,       // gray
  WINDOW: 4,         // cyan
  DOOR: 6,           // magenta
  DIM: 3,            // green
  LABEL: 2,          // yellow
  SLAB: 1,           // red
  ROOF: 5,           // blue
  AXIS: 9,           // light gray
  THICKNESS: 252,    // faint gray for wall thickness fill
  OPENING_FILL: 140, // light cyan
};

// Linetype names
const LT_CONT = "CONTINUOUS";
const LT_DASH = "DASHED";
const LT_CENTER = "CENTER";

// ---------------------------------------------------------------------------
// Layer collection
// ---------------------------------------------------------------------------

interface LayerDef {
  name: string;
  color: number;
  linetype: string;
}

function collectLayers(project: Project): LayerDef[] {
  const layers: LayerDef[] = [];
  const add = (name: string, color: number, lt = LT_CONT) => {
    if (!layers.find((l) => l.name === name)) {
      layers.push({ name, color, linetype: lt });
    }
  };

  for (const building of project.buildings) {
    for (const floor of building.floors) {
    const tag = floorLayerTag(building, floor);
    add(`${tag}_SCIANY_ZEWN`, COL.EXT_WALL);
    add(`${tag}_SCIANY_WEWN`, COL.INT_WALL, LT_DASH);
    add(`${tag}_OKNA`, COL.WINDOW);
    add(`${tag}_DRZWI`, COL.DOOR);
    add(`${tag}_WYMIARY`, COL.DIM);
    add(`${tag}_ETYKIETY`, COL.LABEL);
    add(`${tag}_GRUBOSC`, COL.THICKNESS);

    if (floor.level > 0) {
      add(`STROP_${tag}`, COL.SLAB);
      add(`STROP_${tag}_WYCIECIA`, COL.SLAB, LT_DASH);
    }

    add(`${tag}_SCHODY`, COL.LABEL);

    // Elevation layers
    add(`${tag}_ELEW_SCIANY`, COL.EXT_WALL);
    add(`${tag}_ELEW_OTWORY`, COL.WINDOW);
    add(`${tag}_ELEW_WYMIARY`, COL.DIM);
    add(`${tag}_ELEW_ETYKIETY`, COL.LABEL);
    }
  }

  if (project.buildings.some((b) => b.roof)) {
    add("DACH_OBRYS", COL.ROOF);
    add("DACH_KALENICA", COL.ROOF, LT_CENTER);
    add("DACH_WYMIARY", COL.DIM);
  }

  add("OSIE", COL.AXIS, LT_CENTER);
  add("ZESTAWIENIE_TABELA", COL.DIM);
  add("ZESTAWIENIE_TEKST", COL.LABEL);
  return layers;
}

function sanitizeBuildingSlug(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return (s || "BUD").slice(0, 20).toUpperCase();
}

function floorLayerTag(building: Building, floor: Floor): string {
  const slug = sanitizeBuildingSlug(building.name);
  const level = floor.level === 0 ? "PARTER" : `P${floor.level}`;
  return `${slug}_${level}`;
}

// ---------------------------------------------------------------------------
// Entity builders
// ---------------------------------------------------------------------------

/** R12 POLYLINE + VERTEX + SEQEND (LWPOLYLINE nie występuje w AC1009). */
function polyline(layer: string, pts: [number, number][], closed = true): string {
  if (pts.length < 2) return "";
  const parts: string[] = [
    emit([
      p(0, "POLYLINE"),
      p(8, layer),
      p(66, 1),
      p(70, closed ? 1 : 0),
    ]),
  ];
  for (const [x, y] of pts) {
    parts.push(
      emit([
        p(0, "VERTEX"),
        p(8, layer),
        p(10, r(x)),
        p(20, r(y)),
      ]),
    );
  }
  parts.push(emit([p(0, "SEQEND"), p(8, layer)]));
  return parts.join("\n");
}

function line(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return emit([
    p(0, "LINE"),
    p(8, layer),
    p(10, r(x1)), p(20, r(y1)),
    p(11, r(x2)), p(21, r(y2)),
  ]);
}

function text(
  layer: string,
  x: number, y: number,
  height: number,
  content: string,
  rotation = 0,
  halign = 0, // 0=left, 1=center, 2=right
): string {
  if (halign === 0) {
    return emit([
      p(0, "TEXT"),
      p(8, layer),
      p(10, r(x)), p(20, r(y)),
      p(40, height),
      p(1, content),
      p(50, r(rotation)),
    ]);
  }
  return emit([
    p(0, "TEXT"),
    p(8, layer),
    p(10, r(x)), p(20, r(y)),
    p(11, r(x)), p(21, r(y)),
    p(40, height),
    p(1, content),
    p(50, r(rotation)),
    p(72, halign),
  ]);
}

function dimAligned(
  layer: string,
  x1: number, y1: number,
  x2: number, y2: number,
  offset: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return "";
  const nx = -dy / len * offset;
  const ny = dx / len * offset;

  return emit([
    p(0, "DIMENSION"),
    p(8, layer),
    p(70, 1), // aligned
    p(10, r(x1 + nx)), p(20, r(y1 + ny)), // dimension line location
    p(13, r(x1)), p(23, r(y1)), // first extension line origin
    p(14, r(x2)), p(24, r(y2)), // second extension line origin
    p(1, `${Math.round(len)} mm`),
  ]);
}

function r(n: number): string {
  return Number(n.toFixed(2)).toString();
}

// ---------------------------------------------------------------------------
// Floor plan generator (top-down view)
// ---------------------------------------------------------------------------

function generateFloorPlan(
  floor: Floor,
  building: Building,
  project: Project,
  offsetX: number,
  offsetY: number,
): string[] {
  const entities: string[] = [];
  const tag = floorLayerTag(building, floor);

  const topFloorId = building.floors[building.floors.length - 1]?.id;
  const isTopFloor = floor.id === topFloorId;
  const roofBoundsPlan = computeBoundsFromWalls(
    building.floors[0]?.walls.filter((w) => w.category === "external") ?? []
  );

  const extWalls = floor.walls.filter((w) => w.category === "external");
  const intWalls = floor.walls.filter((w) => w.category === "internal");
  const extPositions = computeFloorPlanPositions(extWalls);
  const intPositions = computeFloorPlanPositions(intWalls);

  // Title
  const bounds = computeBounds(extPositions);
  entities.push(text(
    `${tag}_ETYKIETY`,
    offsetX + bounds.centerX,
    offsetY + bounds.maxY + 800,
    300,
    `${floor.name} — Rzut`,
    0, 1,
  ));

  // External walls with thickness
  for (let i = 0; i < extPositions.length; i++) {
    const wp = extPositions[i];
    const wall = wp.wall;
    const cat = getWallEntry(wall.type);
    const thick = cat.thickness;

    const sx = offsetX + wp.start.x;
    const sy = offsetY + wp.start.y;
    const ex = offsetX + wp.end.x;
    const ey = offsetY + wp.end.y;

    // Wall centerline
    entities.push(line(`${tag}_SCIANY_ZEWN`, sx, sy, ex, ey));

    // Wall thickness rectangle
    const angle = Math.atan2(wp.end.y - wp.start.y, wp.end.x - wp.start.x);
    const nx = -Math.sin(angle) * thick / 2;
    const ny = Math.cos(angle) * thick / 2;

    entities.push(polyline(`${tag}_GRUBOSC`, [
      [sx + nx, sy + ny],
      [ex + nx, ey + ny],
      [ex - nx, ey - ny],
      [sx - nx, sy - ny],
    ]));

    // Dimension line (outside the wall)
    const dimOff = thick / 2 + 400;
    const dnx = -Math.sin(angle) * dimOff;
    const dny = Math.cos(angle) * dimOff;

    entities.push(text(
      `${tag}_WYMIARY`,
      (sx + ex) / 2 + dnx,
      (sy + ey) / 2 + dny,
      150,
      `${Math.round(wallLength(wall))} mm`,
      angle * 180 / Math.PI,
      1,
    ));

    // Wall label
    entities.push(text(
      `${tag}_ETYKIETY`,
      (sx + ex) / 2 - dnx * 0.3,
      (sy + ey) / 2 - dny * 0.3,
      120,
      wall.label,
      angle * 180 / Math.PI,
      1,
    ));

    // Openings on plan
    if (wall.openings.length > 0) {
      const wallLen = wallLength(wall);
      const dx = ex - sx;
      const dy = ey - sy;

      for (const op of wall.openings) {
        const comp = findComponent(op.componentId);
        if (!comp) continue;
        const r = resolveOpeningMm(
          wall,
          op,
          isTopFloor && wall.category === "external" && building.roof ? building.roof : null,
          isTopFloor && wall.category === "external" && building.roof ? roofBoundsPlan : null
        );
        if (r.width < 2) continue;
        const startFrac = r.position / wallLen;
        const endFrac = (r.position + r.width) / wallLen;

        const ox1 = sx + dx * startFrac;
        const oy1 = sy + dy * startFrac;
        const ox2 = sx + dx * endFrac;
        const oy2 = sy + dy * endFrac;

        const isWindow = comp.kind.startsWith("window") || comp.kind === "glazing_fill";
        const openingLayer = isWindow ? `${tag}_OKNA` : `${tag}_DRZWI`;

        // Opening line (thicker, on wall)
        entities.push(line(openingLayer, ox1, oy1, ox2, oy2));

        // Opening break lines (perpendicular ticks)
        const tickLen = thick * 0.7;
        const tnx = -Math.sin(angle) * tickLen / 2;
        const tny = Math.cos(angle) * tickLen / 2;
        entities.push(line(openingLayer, ox1 + tnx, oy1 + tny, ox1 - tnx, oy1 - tny));
        entities.push(line(openingLayer, ox2 + tnx, oy2 + tny, ox2 - tnx, oy2 - tny));

        // Window: add arc swing indicator for tilt windows
        if (comp.kind === "door" || comp.kind === "door_hs") {
          // Door swing line
          const ow = r.width;
          entities.push(line(openingLayer,
            ox1, oy1,
            ox1 + Math.cos(angle + Math.PI / 4) * ow * 0.7,
            oy1 + Math.sin(angle + Math.PI / 4) * ow * 0.7,
          ));
        }

        // Opening label
        entities.push(text(
          openingLayer,
          (ox1 + ox2) / 2 - dnx * 0.6,
          (oy1 + oy2) / 2 - dny * 0.6,
          80,
          `${comp.label}`,
          angle * 180 / Math.PI,
          1,
        ));
      }
    }
  }

  // Internal walls
  for (let i = 0; i < intPositions.length; i++) {
    const wp = intPositions[i];
    const wall = wp.wall;
    const cat = getWallEntry(wall.type);
    const thick = cat.thickness;

    const sx = offsetX + wp.start.x;
    const sy = offsetY + wp.start.y;
    const ex = offsetX + wp.end.x;
    const ey = offsetY + wp.end.y;

    entities.push(line(`${tag}_SCIANY_WEWN`, sx, sy, ex, ey));

    const angle = Math.atan2(wp.end.y - wp.start.y, wp.end.x - wp.start.x);
    const nx = -Math.sin(angle) * thick / 2;
    const ny = Math.cos(angle) * thick / 2;

    entities.push(polyline(`${tag}_SCIANY_WEWN`, [
      [sx + nx, sy + ny],
      [ex + nx, ey + ny],
      [ex - nx, ey - ny],
      [sx - nx, sy - ny],
    ]));

    entities.push(text(
      `${tag}_ETYKIETY`,
      (sx + ex) / 2,
      (sy + ey) / 2 + thick / 2 + 200,
      100,
      `${wall.label} (${Math.round(wallLength(wall))} mm)`,
      angle * 180 / Math.PI,
      1,
    ));

    if (wall.openings.length > 0) {
      const wallLen = wallLength(wall);
      const dx = ex - sx;
      const dy = ey - sy;
      for (const op of wall.openings) {
        const comp = findComponent(op.componentId);
        if (!comp) continue;
        const r = resolveOpeningMm(wall, op, null, null);
        if (r.width < 2) continue;
        const startFrac = r.position / wallLen;
        const endFrac = (r.position + r.width) / wallLen;
        const ox1 = sx + dx * startFrac;
        const oy1 = sy + dy * startFrac;
        const ox2 = sx + dx * endFrac;
        const oy2 = sy + dy * endFrac;
        const isWindow = comp.kind.startsWith("window") || comp.kind === "glazing_fill";
        const openingLayer = isWindow ? `${tag}_OKNA` : `${tag}_DRZWI`;
        entities.push(line(openingLayer, ox1, oy1, ox2, oy2));
        const tickLen = thick * 0.7;
        const tnx = -Math.sin(angle) * tickLen / 2;
        const tny = Math.cos(angle) * tickLen / 2;
        entities.push(line(openingLayer, ox1 + tnx, oy1 + tny, ox1 - tnx, oy1 - tny));
        entities.push(line(openingLayer, ox2 + tnx, oy2 + tny, ox2 - tnx, oy2 - tny));
      }
    }
  }

  // Vertices markers (small crosses at corners)
  for (const wp of extPositions) {
    const cx = offsetX + wp.start.x;
    const cy = offsetY + wp.start.y;
    const sz = 100;
    entities.push(line(`OSIE`, cx - sz, cy, cx + sz, cy));
    entities.push(line(`OSIE`, cx, cy - sz, cx, cy + sz));
  }

  // Slab outline (if upper floor) — uwzględnia odłączony obrys i cutouty
  if (floor.level > 0 && floor.slabThickness > 0) {
    const slabVerts = resolveSlabPolygon(floor);
    if (slabVerts && slabVerts.length >= 3) {
      const slabPts: [number, number][] = slabVerts.map((v) => [
        offsetX + v.x,
        offsetY + v.y,
      ]);
      entities.push(polyline(`STROP_${tag}`, slabPts));

      entities.push(text(
        `STROP_${tag}`,
        offsetX + bounds.centerX,
        offsetY + bounds.centerY,
        150,
        `Strop ${floor.name} (${floor.slabThickness} mm)`,
        0, 1,
      ));

      for (const co of floor.slabShape?.cutouts ?? []) {
        if (co.vertices.length < 3) continue;
        const pts: [number, number][] = co.vertices.map((v) => [
          offsetX + v.x,
          offsetY + v.y,
        ]);
        entities.push(polyline(`STROP_${tag}_WYCIECIA`, pts));
        let cxp = 0, cyp = 0;
        for (const v of co.vertices) { cxp += v.x; cyp += v.y; }
        cxp /= co.vertices.length; cyp /= co.vertices.length;
        entities.push(text(
          `STROP_${tag}_WYCIECIA`,
          offsetX + cxp,
          offsetY + cyp,
          120,
          co.label,
          0, 1,
        ));
      }
    }
  }

  // Schody — footprint i numeracja stopni
  for (const st of building.stairs.filter((s) => s.fromFloorId === floor.id)) {
    const fp = stairFootprint(st);
    if (fp.length >= 3) {
      const pts: [number, number][] = fp.map((v) => [offsetX + v.x, offsetY + v.y]);
      entities.push(polyline(`${tag}_SCHODY`, pts));
    }
    const cos = Math.cos((st.rotation * Math.PI) / 180);
    const sin = Math.sin((st.rotation * Math.PI) / 180);
    for (let i = 1; i < st.stepCount; i++) {
      const ax = i * st.treadDepth;
      const a = { x: st.origin.x + ax * cos, y: st.origin.y + ax * sin };
      const b = {
        x: st.origin.x + ax * cos - st.width * sin,
        y: st.origin.y + ax * sin + st.width * cos,
      };
      entities.push(line(`${tag}_SCHODY`, offsetX + a.x, offsetY + a.y, offsetX + b.x, offsetY + b.y));
    }
    const labelX = st.origin.x + (st.stepCount * st.treadDepth) / 2 * cos - (st.width / 2) * sin;
    const labelY = st.origin.y + (st.stepCount * st.treadDepth) / 2 * sin + (st.width / 2) * cos;
    entities.push(text(
      `${tag}_SCHODY`,
      offsetX + labelX,
      offsetY + labelY,
      150,
      `${st.label} (${st.stepCount})`,
      0, 1,
    ));
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Wall elevation generator (unfolded wall views)
// ---------------------------------------------------------------------------

function generateElevations(
  floor: Floor,
  building: Building,
  project: Project,
  offsetX: number,
  offsetY: number,
): string[] {
  const entities: string[] = [];
  const tag = floorLayerTag(building, floor);
  let cursor = offsetX;

  const topFloorId = building.floors[building.floors.length - 1]?.id;
  const isTopFloor = floor.id === topFloorId;
  const roofBoundsElev = computeBoundsFromWalls(
    building.floors[0]?.walls.filter((w) => w.category === "external") ?? []
  );

  // Title
  entities.push(text(
    `${tag}_ELEW_ETYKIETY`,
    offsetX,
    offsetY + floor.height + 600,
    250,
    `${floor.name} — Rozwinięcie ścian`,
  ));

  for (const wall of floor.walls) {
    const l = Math.round(wallLength(wall));
    const h = wall.height;
    const cat = getWallEntry(wall.type);

    // Wall rectangle
    entities.push(polyline(`${tag}_ELEW_SCIANY`, [
      [cursor, offsetY],
      [cursor + l, offsetY],
      [cursor + l, offsetY + h],
      [cursor, offsetY + h],
    ]));

    // Wall label (top)
    entities.push(text(
      `${tag}_ELEW_ETYKIETY`,
      cursor + l / 2,
      offsetY + h + 250,
      150,
      `${wall.label} — ${cat.shortLabel} (${l}×${h} mm)`,
      0, 1,
    ));

    // Category indicator
    entities.push(text(
      `${tag}_ELEW_ETYKIETY`,
      cursor + l / 2,
      offsetY - 350,
      100,
      wall.category === "external" ? "ZEWNĘTRZNA" : "WEWNĘTRZNA",
      0, 1,
    ));

    // Dimension - width
    entities.push(text(
      `${tag}_ELEW_WYMIARY`,
      cursor + l / 2,
      offsetY - 150,
      120,
      `${l} mm`,
      0, 1,
    ));

    // Dimension - height
    entities.push(text(
      `${tag}_ELEW_WYMIARY`,
      cursor - 200,
      offsetY + h / 2,
      120,
      `${h}`,
      90,
      1,
    ));

    // Openings
    for (const op of wall.openings) {
      const comp = findComponent(op.componentId);
      if (!comp) continue;
      const r = resolveOpeningMm(
        wall,
        op,
        isTopFloor && wall.category === "external" && building.roof ? building.roof : null,
        isTopFloor && wall.category === "external" && building.roof ? roofBoundsElev : null
      );
      if (r.width < 2 || r.height < 2) continue;
      const ow = r.width;
      const oh = r.height;
      const ox = cursor + r.position;
      const oy = offsetY + r.sillHeight;

      const isWindow = comp.kind.startsWith("window") || comp.kind === "glazing_fill";
      const openingLayer = `${tag}_ELEW_OTWORY`;

      // Opening rectangle
      entities.push(polyline(openingLayer, [
        [ox, oy],
        [ox + ow, oy],
        [ox + ow, oy + oh],
        [ox, oy + oh],
      ]));

      // Cross for window (X pattern inside)
      if (isWindow) {
        entities.push(line(openingLayer, ox, oy, ox + ow, oy + oh));
        entities.push(line(openingLayer, ox + ow, oy, ox, oy + oh));
      }

      // Opening label
      entities.push(text(
        openingLayer,
        ox + ow / 2,
        oy + oh / 2,
        80,
        comp.label,
        0, 1,
      ));

      // Opening dimensions
      entities.push(text(
        `${tag}_ELEW_WYMIARY`,
        ox + ow / 2,
        oy - 120,
        80,
        `${ow}×${oh}`,
        0, 1,
      ));
    }

    cursor += l + 1000;
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Roof plan generator
// ---------------------------------------------------------------------------

function generateRoofPlan(
  roof: Roof,
  building: Building,
  project: Project,
  offsetX: number,
  offsetY: number,
): string[] {
  const entities: string[] = [];

  const topFloor = building.floors[building.floors.length - 1];
  if (!topFloor) return entities;

  const extWalls = topFloor.walls.filter((w) => w.category === "external");
  const positions = computeFloorPlanPositions(extWalls);
  const bounds = computeBounds(positions);

  const ovh = roof.overhang;

  // Title
  entities.push(text(
    "DACH_WYMIARY",
    offsetX + bounds.centerX,
    offsetY + bounds.maxY + ovh + 800,
    300,
    `Dach — ${roof.type} (${roof.pitch}°)`,
    0, 1,
  ));

  // Building outline (dashed)
  if (positions.length >= 3) {
    const bldgPts: [number, number][] = positions.map((wp) => [
      offsetX + wp.start.x,
      offsetY + wp.start.y,
    ]);
    entities.push(polyline("OSIE", bldgPts));
  }

  // Roof outline with overhang
  const roofMinX = bounds.minX - ovh;
  const roofMinY = bounds.minY - ovh;
  const roofMaxX = bounds.maxX + ovh;
  const roofMaxY = bounds.maxY + ovh;

  entities.push(polyline("DACH_OBRYS", [
    [offsetX + roofMinX, offsetY + roofMinY],
    [offsetX + roofMaxX, offsetY + roofMinY],
    [offsetX + roofMaxX, offsetY + roofMaxY],
    [offsetX + roofMinX, offsetY + roofMaxY],
  ]));

  // Ridge line for gable/mono
  if (roof.type === "gable" || roof.type === "hip") {
    const ridgeY = offsetY + bounds.centerY;
    entities.push(line(
      "DACH_KALENICA",
      offsetX + roofMinX, ridgeY,
      offsetX + roofMaxX, ridgeY,
    ));

    entities.push(text(
      "DACH_WYMIARY",
      offsetX + bounds.centerX,
      ridgeY + 200,
      120,
      "Kalenica",
      0, 1,
    ));
  }

  // Roof dimensions
  const roofW = roofMaxX - roofMinX;
  const roofH = roofMaxY - roofMinY;
  entities.push(text(
    "DACH_WYMIARY",
    offsetX + bounds.centerX,
    offsetY + roofMinY - 300,
    120,
    `${Math.round(roofW)} mm`,
    0, 1,
  ));
  entities.push(text(
    "DACH_WYMIARY",
    offsetX + roofMinX - 300,
    offsetY + bounds.centerY,
    120,
    `${Math.round(roofH)} mm`,
    90, 1,
  ));

  // Anomalies
  let anomX = offsetX + roofMinX + 500;
  for (const anomaly of roof.anomalies) {
    const aw = anomaly.width;
    const ah = anomaly.height;
    const ax = anomX;
    const ay = offsetY + bounds.centerY - ah / 2;

    entities.push(polyline("DACH_OBRYS", [
      [ax, ay],
      [ax + aw, ay],
      [ax + aw, ay + ah],
      [ax, ay + ah],
    ]));

    entities.push(text(
      "DACH_WYMIARY",
      ax + aw / 2,
      ay + ah / 2,
      80,
      `${anomaly.label} (${anomaly.type})`,
      0, 1,
    ));

    anomX += aw + 500;
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Schedule (Zestawienie ścian i paneli CLT)
// ---------------------------------------------------------------------------

function generateSchedule(project: Project, offsetX: number, offsetY: number): string[] {
  const entities: string[] = [];
  const split = splitProjectPanels(project);
  if (split.walls.length === 0) return entities;

  const tableLayer = "ZESTAWIENIE_TABELA";
  const textLayer = "ZESTAWIENIE_TEKST";

  const colWidths = [2500, 5000, 2000, 2000, 2500, 8000, 1500, 2000, 2000];
  const headers = ["Piętro", "Ściana", "Dług.[mm]", "Wys.[mm]", "Typ", "Panele [mm]", "Styki", "Odpad[m³]", "Czas[h]"];
  const rowH = 600;
  const textH = 200;
  const totalW = colWidths.reduce((s, w) => s + w, 0);

  const title = `ZESTAWIENIE ŚCIAN — ${split.totalPanels} paneli, odpad ${split.totalWasteM3.toFixed(3)} m³, obróbka ${(split.totalMachiningSeconds / 3600).toFixed(2)} h`;
  entities.push(text(textLayer, offsetX, offsetY + rowH * 0.3, 300, title, 0, 0));

  const floorsById = new Map(allFloorsInProject(project).map((f) => [f.id, f]));
  const rows: string[][] = [];
  for (const floor of allFloorsInProject(project)) {
    for (const wall of floor.walls) {
      const b = split.walls.find((x) => x.wallId === wall.id);
      if (!b) continue;
      const cat = getWallEntry(wall.type);
      const bname = project.buildings.find((bu) => bu.floors.some((fl) => fl.id === floor.id))?.name ?? "";
      rows.push([
        bname ? `${bname} — ${floor.name}` : floor.name,
        wall.label,
        String(b.wallLengthMM),
        String(b.wallHeightMM),
        cat.shortLabel,
        b.panels.map((p) => Math.round(p.widthMM)).join(" + ") || "—",
        String(b.jointCount),
        b.toothWasteM3.toFixed(3),
        (b.machiningSeconds / 3600).toFixed(2),
      ]);
    }
  }
  void floorsById;

  const tableTop = offsetY - 800;
  const totalRows = rows.length + 1;
  const tableBottom = tableTop - totalRows * rowH;

  entities.push(line(tableLayer, offsetX, tableTop, offsetX + totalW, tableTop));
  entities.push(line(tableLayer, offsetX, tableBottom, offsetX + totalW, tableBottom));
  let xAcc = offsetX;
  for (let i = 0; i <= colWidths.length; i++) {
    entities.push(line(tableLayer, xAcc, tableTop, xAcc, tableBottom));
    if (i < colWidths.length) xAcc += colWidths[i];
  }

  let yRow = tableTop - rowH;
  entities.push(line(tableLayer, offsetX, yRow, offsetX + totalW, yRow));
  let xCell = offsetX;
  for (let c = 0; c < headers.length; c++) {
    entities.push(text(textLayer, xCell + 100, yRow + rowH * 0.25, textH, headers[c], 0, 0));
    xCell += colWidths[c];
  }

  for (const row of rows) {
    yRow -= rowH;
    entities.push(line(tableLayer, offsetX, yRow, offsetX + totalW, yRow));
    xCell = offsetX;
    for (let c = 0; c < row.length; c++) {
      entities.push(text(textLayer, xCell + 100, yRow + rowH * 0.25, textH, row[c], 0, 0));
      xCell += colWidths[c];
    }
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export function generateDxf(project: Project): string {
  const layers = collectLayers(project);

  // --- HEADER ---
  const header = emit([
    p(0, "SECTION"),
    p(2, "HEADER"),
    p(9, "$ACADVER"),
    p(1, "AC1009"),
    p(9, "$INSUNITS"),
    p(70, 4), // mm
    p(9, "$DIMSCALE"),
    p(40, 1),
    p(0, "ENDSEC"),
  ]);

  // --- TABLES (linetypes + layers) ---
  const linetypeEntries = [
    emit([
      p(0, "LTYPE"), p(2, "CONTINUOUS"), p(70, 0), p(3, "Solid line"),
      p(72, 65), p(73, 0), p(40, 0),
    ]),
    emit([
      p(0, "LTYPE"), p(2, "DASHED"), p(70, 0), p(3, "Dashed __ __ __"),
      p(72, 65), p(73, 2), p(40, 600),
      p(49, 400), p(49, -200),
    ]),
    emit([
      p(0, "LTYPE"), p(2, "CENTER"), p(70, 0), p(3, "Center ____ _ ____"),
      p(72, 65), p(73, 4), p(40, 2000),
      p(49, 1250), p(49, -250), p(49, 250), p(49, -250),
    ]),
  ];

  const layerEntries = layers.map((l) => emit([
    p(0, "LAYER"),
    p(2, l.name),
    p(70, 0),
    p(62, l.color),
    p(6, l.linetype),
  ]));

  const tables = [
    emit([p(0, "SECTION"), p(2, "TABLES")]),
    emit([p(0, "TABLE"), p(2, "LTYPE"), p(70, linetypeEntries.length)]),
    ...linetypeEntries,
    emit([p(0, "ENDTAB")]),
    emit([p(0, "TABLE"), p(2, "LAYER"), p(70, layers.length)]),
    ...layerEntries,
    emit([p(0, "ENDTAB")]),
    emit([p(0, "ENDSEC")]),
  ].join("\n");

  // --- BLOCKS (wymagana sekcja, nawet pusta) ---
  const blocksSection = emit([
    p(0, "SECTION"),
    p(2, "BLOCKS"),
    p(0, "ENDSEC"),
  ]);

  // --- ENTITIES ---
  const entities: string[] = [];

  // Floor plans — stacked vertically (z przesunięciem pozycji budynku na działce)
  let floorOffsetY = 0;
  for (const building of project.buildings) {
    for (const floor of building.floors) {
      const extWalls = floor.walls.filter((w) => w.category === "external");
      const positions = computeFloorPlanPositions(extWalls);
      const bounds = computeBounds(positions);

      entities.push(...generateFloorPlan(floor, building, project, building.position.x, floorOffsetY + building.position.y));
      floorOffsetY += bounds.height + 3000;
    }

    if (building.roof) {
      entities.push(...generateRoofPlan(building.roof, building, project, building.position.x, floorOffsetY + building.position.y));

      const topFloor = building.floors[building.floors.length - 1];
      if (topFloor) {
        const extWalls = topFloor.walls.filter((w) => w.category === "external");
        const bounds = computeBounds(computeFloorPlanPositions(extWalls));
        floorOffsetY += bounds.height + building.roof.overhang * 2 + 3000;
      }
    }
  }

  // Elevation views — to the right of plans
  const elevOffsetX = 25000;
  let elevOffsetY = 0;
  for (const building of project.buildings) {
    for (const floor of building.floors) {
      entities.push(...generateElevations(floor, building, project, elevOffsetX + building.position.x, elevOffsetY + building.position.y));
      elevOffsetY += floor.height + 2000;
    }
  }

  // Zestawienie ścian — below all plans
  entities.push(...generateSchedule(project, 0, floorOffsetY));

  const entitiesSection = [
    emit([p(0, "SECTION"), p(2, "ENTITIES")]),
    ...entities,
    emit([p(0, "ENDSEC")]),
  ].join("\n");

  const eof = emit([p(0, "EOF")]);

  return [header, tables, blocksSection, entitiesSection, eof].join("\n");
}
