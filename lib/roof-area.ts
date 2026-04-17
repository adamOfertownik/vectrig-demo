// lib/roof-area.ts — powierzchnia rozwinięta dachu (wspólne dla wyceny i zestawienia)
import type { Building, Project, Roof } from "./types";
import { shoelaceAreaSqm } from "./geometry";

function roofAreaSqmForGround(roof: Roof, groundFloor: import("./types").Floor | undefined): number {
  if (!groundFloor) return 0;

  const footprint = shoelaceAreaSqm(groundFloor.walls);
  if (footprint <= 0) return 0;

  const extWalls = groundFloor.walls.filter((w) => w.category === "external");
  if (extWalls.length < 2) return 0;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of extWalls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  const width = (maxX - minX) / 1000;
  const depth = (maxY - minY) / 1000;

  const pitchRad = (roof.pitch * Math.PI) / 180;
  const cosP = Math.cos(pitchRad);
  const overhangM = roof.overhang / 1000;

  let area = 0;
  switch (roof.type) {
    case "flat":
      area = (width + 2 * overhangM) * (depth + 2 * overhangM);
      break;
    case "mono_pitch":
      area = ((width + 2 * overhangM) * (depth + 2 * overhangM)) / (cosP || 1);
      break;
    case "gable": {
      const slopeLength = (depth / 2 + overhangM) / (cosP || 1);
      area = 2 * slopeLength * (width + 2 * overhangM);
      break;
    }
    case "hip": {
      const slopeW = (depth / 2 + overhangM) / (cosP || 1);
      const slopeD = (width / 2 + overhangM) / (cosP || 1);
      area = 2 * (slopeW * (width + 2 * overhangM) / 2)
           + 2 * (slopeD * (depth + 2 * overhangM) / 2);
      break;
    }
  }

  const skylightCutout = roof.anomalies
    .filter((a) => a.type === "skylight" || a.type === "chimney")
    .reduce((sum, a) => sum + (a.width * a.height) / 1_000_000, 0);

  return Math.max(0, area - skylightCutout);
}

/** Powierzchnia dachu jednego budynku (m²). */
export function roofSurfaceAreaSqmForBuilding(building: Building): number {
  if (!building.roof) return 0;
  return roofAreaSqmForGround(building.roof, building.floors[0]);
}

export function roofSurfaceAreaSqm(project: Project): number {
  let sum = 0;
  for (const b of project.buildings) {
    sum += roofSurfaceAreaSqmForBuilding(b);
  }
  return sum;
}
