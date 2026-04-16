// lib/openings.ts — dopasowanie otworów do geometrii ściany (granice, dach)
import type { Opening, Wall, Roof } from "./types";
import { findComponent } from "./catalog";
import { wallLength, wallRoofProfile, type RoofBounds, type WallProfilePoint } from "./geometry";

function interpolateExtra(profile: WallProfilePoint[], xMm: number): number {
  if (profile.length === 0) return 0;
  const sorted = [...profile].sort((a, b) => a.x - b.x);
  if (xMm <= sorted[0].x) return sorted[0].extra;
  if (xMm >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].extra;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (xMm >= a.x && xMm <= b.x) {
      const t = b.x === a.x ? 0 : (xMm - a.x) / (b.x - a.x);
      return a.extra + t * (b.extra - a.extra);
    }
  }
  return sorted[sorted.length - 1].extra;
}

/** Najniższy punkt górnej krawędzi ściany (mm) w przedziale [posMm, posMm+widthMm] wzdłuż ściany — ogranicza wysokość otworu. */
export function minWallTopAlongOpeningMm(
  wall: Wall,
  roof: Roof | null,
  bounds: RoofBounds | null,
  posMm: number,
  widthMm: number
): number {
  if (!roof || !bounds || roof.type === "flat") return wall.height;
  const L = wallLength(wall);
  const prof = wallRoofProfile(wall, roof, bounds);
  const x0 = Math.max(0, posMm);
  const x1 = Math.min(L, posMm + widthMm);
  if (x0 >= x1) return wall.height;
  let minTop = Infinity;
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const top = wall.height + interpolateExtra(prof, x);
    minTop = Math.min(minTop, top);
  }
  for (const p of prof) {
    if (p.x >= x0 - 1 && p.x <= x1 + 1) {
      minTop = Math.min(minTop, wall.height + p.extra);
    }
  }
  return Number.isFinite(minTop) ? minTop : wall.height;
}

export interface ResolvedOpeningMm {
  position: number;
  width: number;
  sillHeight: number;
  height: number;
}

/**
 * Skuteczne wymiary otworu do rysowania i wycinania (mm), z przycięciem do długości ściany
 * i do linii dachu (górny limit otworu nie wyżej niż najniższy punkt kalenicy nad zakresem otworu).
 */
export function resolveOpeningMm(
  wall: Wall,
  op: Opening,
  roof: Roof | null,
  bounds: RoofBounds | null
): ResolvedOpeningMm {
  const comp = findComponent(op.componentId);
  const wallLen = wallLength(wall);
  let w = op.customWidth ?? comp?.width ?? 0;
  w = Math.max(0, Math.min(w, wallLen));
  let position = Math.max(0, Math.min(op.position, Math.max(0, wallLen - w)));
  const rawH = op.customHeight ?? comp?.height ?? 0;
  let sill = op.sillHeight;
  if (comp?.kind.startsWith("door")) sill = 0;

  let h = rawH;
  const maxTop = minWallTopAlongOpeningMm(wall, roof, bounds, position, w);
  if (sill + h > maxTop) h = Math.max(0, maxTop - sill);
  h = Math.min(h, Math.max(0, maxTop - sill));
  if (sill < 0) sill = 0;
  if (sill > maxTop) sill = Math.max(0, maxTop - 100);

  return { position, width: w, sillHeight: sill, height: h };
}
